import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STORED_RESULTS = 50;

export type CallResultFields = Record<string, string | number | boolean | null>;

export type CallResult = {
  id: string;
  callId: string | null;
  providerName: string | null;
  requestReference: string | null;
  capturedAt: string;
  receivedAt: string;
  fields: CallResultFields;
};

/**
 * In-memory result store. Per-process and lost on restart, which is fine for a
 * demo: nothing here should outlive the session, and a records-office procedure
 * is not something we want sitting in a database anyway.
 */
const results: CallResult[] = [];

function jsonResponse(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Keeps only the primitive shapes the UI knows how to render. */
function normalizeFields(raw: unknown): CallResultFields {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: CallResultFields = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      out[key] = value;
    } else {
      out[key] = null;
    }
  }
  return out;
}

export async function POST(request: Request) {
  const expectedSecret = process.env.SSDI_WEBHOOK_SECRET;
  if (expectedSecret) {
    const presented = request.headers.get("x-ssdi-secret") ?? "";
    if (!constantTimeEquals(presented, expectedSecret)) {
      return jsonResponse({ error: "Not authorized." }, 401);
    }
  }
  // No secret configured means dev mode: accept the post so a local agent run
  // can round-trip without extra setup.

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Malformed payload." }, 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonResponse({ error: "Malformed payload." }, 400);
  }

  const payload = body as Record<string, unknown>;
  const now = new Date().toISOString();

  const record: CallResult = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    callId: asNullableString(payload.call_id),
    providerName: asNullableString(payload.provider_name),
    requestReference: asNullableString(payload.request_reference),
    capturedAt: asNullableString(payload.captured_at) ?? now,
    receivedAt: now,
    fields: normalizeFields(payload.fields),
  };

  results.push(record);
  while (results.length > MAX_STORED_RESULTS) {
    results.shift();
  }

  return jsonResponse({ ok: true, stored: results.length }, 200);
}

export async function GET() {
  const newestFirst = [...results].reverse();
  return jsonResponse({ results: newestFirst, count: newestFirst.length }, 200);
}
