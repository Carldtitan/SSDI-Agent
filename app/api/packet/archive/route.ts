import { zipSync } from "fflate";
import { NextResponse } from "next/server";

import { PacketServiceError } from "@/lib/anvil/client";
import { parseApplicantCase } from "@/lib/case/transport";
import { evaluateCompleteness } from "@/lib/conversation/completeness";
import { generateDocumentFiles } from "@/lib/documents/packet";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_REQUEST_BYTES = 1_000_000;

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
      return privateError("That case is too large to create a folder.", 413);
    }
    const applicantCase = parseApplicantCase(JSON.parse(rawBody));
    if (!evaluateCompleteness(applicantCase).ready) {
      return privateError("Complete the required answers before creating the case folder.", 422);
    }
    const documents = await generateDocumentFiles(
      applicantCase,
      new Date().toISOString().slice(0, 10),
    );
    const archive = zipSync(
      Object.fromEntries(
        documents.map((document) => [document.fileName, document.bytes]),
      ),
      { level: 6 },
    );
    return new Response(Buffer.from(archive), {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition": 'attachment; filename="ssdi-agent-case-forms.zip"',
        "Content-Length": String(archive.byteLength),
        "Content-Type": "application/zip",
        "X-Packet-Documents": String(documents.length),
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return privateError("The case could not be read. Please try again.", 400);
    }
    if (
      error instanceof PacketServiceError ||
      (error instanceof Error &&
        (error.message === "packet_validation" || error.name === "ZodError"))
    ) {
      return privateError("The case folder could not be generated yet.", 503);
    }
    return privateError("The case folder could not be generated yet.", 503);
  }
}

function privateError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
