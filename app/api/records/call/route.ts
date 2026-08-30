import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Guava dials over a persistent websocket held open by the Python agent
// process, so there is no REST endpoint that places a single outbound call.
// This route therefore delegates to the local shim (agent/serve.py), which
// runs `agent.call_phone(...)` for us.
//
// The agent's persona, compliance rules and task checklist now live in
// agent/main.py. The call prompt deliberately does NOT belong in this route
// any more; this route only validates consent, rate limits, and hands off.
const DEFAULT_SHIM_URL = "http://127.0.0.1:8787/call";

const callRequestSchema = z.object({
  consent: z.literal(true),
  providerName: z.string().trim().min(2).max(200),
  providerPhone: z.string().trim().min(7).max(40),
  requestReference: z.string().trim().min(1).max(120).optional(),
});

const callAttempts = new Map<string, number[]>();
const MAX_CALLS_PER_HOUR = 3;

export async function POST(request: Request) {
  const parsed = callRequestSchema.safeParse(await safeJson(request));
  if (!parsed.success) {
    return noStore(
      NextResponse.json(
        { error: "Confirm the provider and phone number before calling." },
        { status: 400 },
      ),
    );
  }

  const providerPhone = normalizePhone(parsed.data.providerPhone);
  if (!providerPhone) {
    return noStore(
      NextResponse.json(
        { error: "Add a valid provider phone number before calling." },
        { status: 400 },
      ),
    );
  }

  const caller = request.headers.get("x-forwarded-for")?.split(",")[0] ??
    "local";
  if (!reserveCall(caller)) {
    return noStore(
      NextResponse.json(
        { error: "Three calls were already started this hour. Try later." },
        { status: 429 },
      ),
    );
  }

  try {
    const shimUrl = process.env.SSDI_SHIM_URL ?? DEFAULT_SHIM_URL;
    const shimToken = process.env.SSDI_SHIM_TOKEN;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (shimToken) headers["X-SSDI-Token"] = shimToken;

    const response = await fetch(shimUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        consent: true,
        providerName: parsed.data.providerName,
        providerPhone,
        requestReference: parsed.data.requestReference ?? "SSDI-WEB",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });

    const body = (await safeJsonResponse(response)) as {
      status?: string;
      to?: string;
      provider?: string;
      error?: string;
    } | null;

    if (response.status === 409) {
      releaseCall(caller);
      return noStore(
        NextResponse.json(
          { error: "A call is already in progress. Try again once it ends." },
          { status: 409 },
        ),
      );
    }

    if (response.status === 503) {
      releaseCall(caller);
      return noStore(
        NextResponse.json(
          { error: "Provider calling is not configured." },
          { status: 503 },
        ),
      );
    }

    if (!response.ok) {
      throw new Error(`Call shim returned ${response.status}`);
    }

    return noStore(
      NextResponse.json(
        {
          status: body?.status ?? "dialing",
          to: body?.to ?? providerPhone,
          provider: body?.provider ?? parsed.data.providerName,
        },
        { status: 202 },
      ),
    );
  } catch (error) {
    releaseCall(caller);
    // Log the failure shape only. Never log the request body: it carries
    // provider and applicant context.
    console.error("SSDI Agent provider call failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return noStore(
      NextResponse.json(
        {
          error:
            "The provider call could not start. Make sure the SSDI Agent call service is running, then try again.",
        },
        { status: 502 },
      ),
    );
  }
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

function reserveCall(key: string) {
  const cutoff = Date.now() - 60 * 60 * 1_000;
  const recent = (callAttempts.get(key) ?? []).filter((time) => time > cutoff);
  if (recent.length >= MAX_CALLS_PER_HOUR) return false;
  recent.push(Date.now());
  callAttempts.set(key, recent);
  return true;
}

function releaseCall(key: string) {
  const recent = callAttempts.get(key);
  recent?.pop();
  if (!recent?.length) callAttempts.delete(key);
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function safeJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
