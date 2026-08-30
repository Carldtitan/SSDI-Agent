import { NextResponse } from "next/server";

import { PacketServiceError } from "@/lib/anvil/client";
import { parseApplicantCase } from "@/lib/case/transport";
import { evaluateCompleteness } from "@/lib/conversation/completeness";
import { generateDocumentPacket } from "@/lib/documents/packet";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_REQUEST_BYTES = 1_000_000;

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_REQUEST_BYTES) {
    return privateError("That case is too large to create a packet.", 413);
  }

  try {
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) {
      return privateError("That case is too large to create a packet.", 413);
    }
    const applicantCase = parseApplicantCase(JSON.parse(rawBody));
    const completion = evaluateCompleteness(applicantCase);
    if (!completion.ready) {
      return NextResponse.json(
        {
          error:
            "Complete the required answers before creating the documents.",
          missingItemIds: completion.blocking.map((issue) => issue.id),
        },
        {
          status: 422,
          headers: { "Cache-Control": "no-store, max-age=0" },
        },
      );
    }
    const packet = await generateDocumentPacket(
      applicantCase,
      new Date().toISOString().slice(0, 10),
    );

    return new Response(Buffer.from(packet.bytes), {
      status: 200,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "Content-Disposition":
          'attachment; filename="ssdiAgent-ssdi-application-packet.pdf"',
        "Content-Length": String(packet.bytes.byteLength),
        "Content-Type": "application/pdf",
        "X-Packet-Documents": String(packet.documentLabels.length),
        "X-Packet-Pages": String(packet.pageCount),
      },
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return privateError("The case could not be read. Please try again.", 400);
    }
    if (
      error instanceof Error &&
      (error.message === "packet_validation" ||
        error.name === "ZodError")
    ) {
      return privateError(
        "Review the highlighted facts before creating the packet.",
        422,
      );
    }
    if (error instanceof PacketServiceError) {
      return privateError(
        "Document generation is unavailable right now. Your answers are still here.",
        503,
      );
    }
    return privateError(
      "Document generation is unavailable right now. Your answers are still here.",
      503,
    );
  }
}

function privateError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store, max-age=0" },
    },
  );
}
