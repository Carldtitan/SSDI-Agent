import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Guava has no REST endpoint that places a single outbound call -- the SDK
 * dials over a persistent websocket held open by the Python agent process. So
 * this route does not talk to Guava at all. It hands the request to the local
 * Python shim (agent/serve.py), which owns that websocket and does the dialing.
 */
const SHIM_URL = process.env.SSDI_SHIM_URL ?? "http://127.0.0.1:8787/call";

const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const CALL_TIMEOUT_MS = 20_000;

/**
 * Per-process rate limiter. This resets on redeploy and is not shared between
 * instances -- deliberate for a demo. A real deployment would put this in a
 * durable store so one person cannot dial a records office from three regions.
 */
const callLog = new Map<string, number[]>();

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (!forwarded) return "local";
  const first = forwarded.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "local";
}

/** Returns false when the caller is over budget. Records the attempt if not. */
function takeRateLimitSlot(key: string): boolean {
  const now = Date.now();
  const recent = (callLog.get(key) ?? []).filter(
    (at) => now - at < RATE_LIMIT_WINDOW_MS,
  );
  if (recent.length >= RATE_LIMIT_MAX) {
    callLog.set(key, recent);
    return false;
  }
  recent.push(now);
  callLog.set(key, recent);
  return true;
}

/** Hands the slot back when the call never actually left the building. */
function releaseRateLimitSlot(key: string) {
  const recent = callLog.get(key);
  if (!recent || recent.length === 0) return;
  recent.pop();
  callLog.set(key, recent);
}

/**
 * Normalizes what a person typed into E.164.
 *  - 10 digits        -> assumed North American, prefixed +1
 *  - 8 to 15 digits   -> taken as already country-coded, prefixed +
 *  - anything else    -> rejected
 */
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function newRequestReference(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SSDI-${stamp}-${suffix}`;
}

export async function POST(request: Request) {
  // Fail closed. With nowhere to send the request we cannot dial, and we would
  // rather say so plainly than hand back a success the caller waits on forever.
  if (!SHIM_URL || SHIM_URL.trim().length === 0) {
    return jsonResponse(
      {
        error:
          "Calling is not switched on yet. The dialer address is missing, so no call was placed.",
      },
      503,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // Never log the body -- it carries a provider name and phone number.
    return jsonResponse(
      { error: "We could not read that request. Please try again." },
      400,
    );
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonResponse(
      { error: "We could not read that request. Please try again." },
      400,
    );
  }

  const payload = body as Record<string, unknown>;

  if (payload.consent !== true) {
    return jsonResponse(
      {
        error:
          "We need your say-so before calling. Please check the consent box and try again.",
      },
      400,
    );
  }

  const providerNameRaw = payload.providerName;
  if (typeof providerNameRaw !== "string") {
    return jsonResponse({ error: "Please tell us the provider name." }, 400);
  }
  const providerName = providerNameRaw.trim();
  if (providerName.length < 2 || providerName.length > 200) {
    return jsonResponse(
      { error: "Please enter the provider name, between 2 and 200 characters." },
      400,
    );
  }

  const providerPhoneRaw = payload.providerPhone;
  if (typeof providerPhoneRaw !== "string") {
    return jsonResponse(
      { error: "Please tell us the records office phone number." },
      400,
    );
  }
  const toNumber = normalizePhone(providerPhoneRaw);
  if (!toNumber) {
    return jsonResponse(
      {
        error:
          "That phone number does not look complete. Please include the area code.",
      },
      400,
    );
  }

  const key = clientKey(request);
  if (!takeRateLimitSlot(key)) {
    return jsonResponse(
      {
        error:
          "That is three calls in the last hour. Please take a break and try again later.",
      },
      429,
    );
  }

  const requestReference = newRequestReference();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const shimToken = process.env.SSDI_SHIM_TOKEN;
  if (shimToken) headers["X-SSDI-Token"] = shimToken;

  try {
    const shimResponse = await fetch(SHIM_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        consent: true,
        providerName,
        providerPhone: toNumber,
        requestReference,
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      cache: "no-store",
    });

    if (!shimResponse.ok) {
      releaseRateLimitSlot(key);
      // Log the status only. The body may echo the number we sent.
      console.error(
        `[ssdi-agent] dialer rejected the request with status ${shimResponse.status}`,
      );
      return jsonResponse(
        {
          error:
            "The dialer did not accept the request just now. Nothing was dialed -- please try again in a moment.",
        },
        502,
      );
    }

    let dialingTo: string | null = null;
    try {
      const result = (await shimResponse.json()) as Record<string, unknown>;
      if (typeof result.to === "string") dialingTo = result.to;
    } catch {
      // A call that started but reported nothing back is still a started call.
    }

    return jsonResponse(
      {
        ok: true,
        status: "dialing",
        requestReference,
        providerName,
        toNumber: dialingTo ?? toNumber,
      },
      202,
    );
  } catch (error) {
    releaseRateLimitSlot(key);
    const reason = error instanceof Error ? error.name : "UnknownError";
    console.error(`[ssdi-agent] call start failed: ${reason}`);
    return jsonResponse(
      {
        error:
          "We could not reach the dialer, so no call was placed. Please try again in a moment.",
      },
      502,
    );
  }
}
