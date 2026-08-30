"""HTTP shim that lets the SSDI Agent web app place a real outbound call.

Guava's SDK dials over a persistent websocket from the agent process, so there
is no REST endpoint a Next.js route can post to in order to start a single call.
This module closes that gap: it exposes one endpoint, POST /call, and runs
`agent.call_phone(...)` on a worker thread for each request.

    uv run serve.py            # listens on 0.0.0.0:8787

Environment:
    SSDI_AGENT_NUMBER   the Guava number to dial from   (required)
    SSDI_SHIM_TOKEN     shared secret; when set, callers must send it in
                            the X-SSDI-Token header
    SSDI_SHIM_PORT      listen port, default 8787

Deliberately stdlib-only so it adds no dependency to the deployed agent.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from guava import logging_utils

from main import agent

logger = logging.getLogger("ssdi_agent.shim")

MAX_BODY_BYTES = 16 * 1024
E164 = re.compile(r"^\+[1-9]\d{7,14}$")

# One call at a time keeps a demo predictable and stops a stuck request from
# fanning out into a pile of concurrent dials.
_call_lock = threading.Lock()
_active = {"call": False}


def normalize_phone(raw: str) -> str | None:
    """Return an E.164 number, or None when the input cannot be one."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 10:
        candidate = "+1" + digits
    elif 8 <= len(digits) <= 15:
        candidate = "+" + digits
    else:
        return None
    return candidate if E164.match(candidate) else None


def place_call(to_number: str, variables: dict) -> None:
    """Run the blocking Guava call, then release the slot."""
    from_number = os.environ["SSDI_AGENT_NUMBER"]
    try:
        logger.info("Dialing %s as %s", to_number, variables.get("provider_name"))
        agent.call_phone(
            from_number=from_number,
            to_number=to_number,
            variables=variables,
        )
        logger.info("Call to %s finished", to_number)
    except Exception:
        logger.exception("Call to %s failed", to_number)
    finally:
        with _call_lock:
            _active["call"] = False


class Handler(BaseHTTPRequestHandler):
    server_version = "SsdiAgentShim/1.0"

    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-SSDI-Token")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802 - stdlib naming
        self._send(204, {})

    def do_GET(self):  # noqa: N802 - stdlib naming
        if self.path.rstrip("/") == "/health":
            with _call_lock:
                busy = _active["call"]
            self._send(200, {"ok": True, "call_in_progress": busy})
        else:
            self._send(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802 - stdlib naming
        if self.path.rstrip("/") != "/call":
            self._send(404, {"error": "not found"})
            return

        token = os.environ.get("SSDI_SHIM_TOKEN")
        if token and self.headers.get("X-SSDI-Token") != token:
            self._send(401, {"error": "unauthorized"})
            return

        if not os.environ.get("SSDI_AGENT_NUMBER"):
            self._send(503, {"error": "SSDI_AGENT_NUMBER is not configured"})
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            self._send(400, {"error": "bad content length"})
            return
        if length <= 0 or length > MAX_BODY_BYTES:
            self._send(400, {"error": "bad request body"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            self._send(400, {"error": "invalid JSON"})
            return

        # Consent is an explicit literal, never merely truthy: the applicant has
        # to have asked for this call.
        if payload.get("consent") is not True:
            self._send(400, {"error": "consent must be true"})
            return

        provider_name = str(payload.get("providerName") or "").strip()
        if not 2 <= len(provider_name) <= 200:
            self._send(400, {"error": "providerName must be 2-200 characters"})
            return

        to_number = normalize_phone(str(payload.get("providerPhone") or ""))
        if not to_number:
            self._send(400, {"error": "providerPhone is not a valid number"})
            return

        with _call_lock:
            if _active["call"]:
                self._send(409, {"error": "a call is already in progress"})
                return
            _active["call"] = True

        variables = {
            "provider_name": provider_name,
            "request_reference": str(payload.get("requestReference") or "SSDI-WEB"),
        }
        threading.Thread(
            target=place_call, args=(to_number, variables), daemon=True
        ).start()
        self._send(202, {"status": "dialing", "to": to_number, "provider": provider_name})

    def log_message(self, fmt, *args):
        # Route through logging, and never echo request bodies.
        logger.info("%s - %s", self.address_string(), fmt % args)


def main() -> None:
    logging_utils.configure_logging()
    port = int(os.environ.get("SSDI_SHIM_PORT", "8787"))
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    logger.info("SSDI Agent shim listening on port %s", port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()
