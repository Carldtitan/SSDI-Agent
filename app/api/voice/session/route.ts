import { NextResponse } from "next/server";

/**
 * Mints a Guava WebRTC session for the browser.
 *
 * The browser never sees GUAVA_API_KEY. It receives only a short-lived
 * `grtc-` WebRTC code (Guava's own browser credential) plus the two WebSocket
 * URLs the voice session dials. Equivalent to the SDK's
 * `client.create_webrtc_agent(ttl=...)`, which is a POST to
 * `/v1/webrtc-agents?ttl_sec=<seconds>` with a bearer API key.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const DEFAULT_TTL_SECONDS = 3_600;

function appBaseUrl() {
  const raw =
    process.env.NEXT_PUBLIC_GUAVA_APP_URL?.trim() || "https://app.goguava.ai";
  return raw.replace(/\/+$/, "");
}

function websocketBase() {
  return appBaseUrl().replace(/^http:/, "ws:").replace(/^https:/, "wss:");
}

function apiBaseUrl() {
  const raw =
    process.env.GUAVA_API_BASE_URL?.trim() || "https://api.goguava.ai";
  return raw.replace(/\/+$/, "");
}

function sessionPayload(webrtcCode: string) {
  const base = websocketBase();
  return {
    chatUrl: `${base}/webrtc-chat/`,
    socketUrl: `${base}/webrtc/`,
    webrtcCode,
  };
}

export async function POST() {
  const apiKey = process.env.GUAVA_API_KEY?.trim();
  if (!apiKey) {
    // Fail closed: without a key we cannot mint a code, and the app must fall
    // back to typed input rather than pretend voice is available.
    return NextResponse.json(
      {
        error:
          "Voice is not configured. Add a Guava API key to enable spoken questions.",
      },
      { headers: NO_STORE, status: 503 },
    );
  }

  // A permanent code minted from the Guava dashboard or `guava widget` skips
  // the round trip entirely.
  const staticCode = process.env.GUAVA_WEBRTC_CODE?.trim();
  if (staticCode) {
    return NextResponse.json(sessionPayload(staticCode), { headers: NO_STORE });
  }

  const ttlSeconds = Number(process.env.GUAVA_WEBRTC_TTL_SECONDS ?? "") || DEFAULT_TTL_SECONDS;

  let response: Response;
  try {
    response = await fetch(
      `${apiBaseUrl()}/v1/webrtc-agents?ttl_sec=${encodeURIComponent(ttlSeconds)}`,
      {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "x-guava-sdk": "ssdi-agent-web",
        },
        method: "POST",
      },
    );
  } catch {
    // Never echo the request (it carries the bearer token) into logs or bodies.
    return NextResponse.json(
      { error: "Guava voice is unreachable right now. Please type your answer." },
      { headers: NO_STORE, status: 502 },
    );
  }

  if (!response.ok) {
    return NextResponse.json(
      {
        error: `Guava could not start a voice session (status ${response.status}).`,
      },
      { headers: NO_STORE, status: 502 },
    );
  }

  const body = (await response.json().catch(() => null)) as {
    webrtc_code?: string;
  } | null;
  const webrtcCode = body?.webrtc_code;
  if (!webrtcCode) {
    return NextResponse.json(
      { error: "Guava did not return a voice session code." },
      { headers: NO_STORE, status: 502 },
    );
  }

  return NextResponse.json(sessionPayload(webrtcCode), { headers: NO_STORE });
}
