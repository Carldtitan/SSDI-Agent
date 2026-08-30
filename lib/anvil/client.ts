import "server-only";

import Anvil from "@anvilco/anvil";

import type { HtmlDocument } from "@/lib/documents/evidence-index";
import type { FormKind, FormPayload } from "@/lib/forms/types";

const EID_ENV: Record<FormKind, string> = {
  ssa16: "ANVIL_EID_SSA16",
  ssa3368: "ANVIL_EID_SSA3368",
  ssa3369: "ANVIL_EID_SSA3369",
  ssa827: "ANVIL_EID_SSA827",
};

export class PacketServiceError extends Error {
  constructor(
    public readonly code:
      | "configuration"
      | "validation"
      | "generation"
      | "invalid_pdf",
  ) {
    super(code);
    this.name = "PacketServiceError";
  }
}

function createClient() {
  const apiKey = process.env.ANVIL_API_KEY;
  if (!apiKey) throw new PacketServiceError("configuration");
  return new Anvil({ apiKey });
}

export async function fillAnvilForm(
  kind: FormKind,
  payload: FormPayload,
): Promise<Uint8Array> {
  const eid = process.env[EID_ENV[kind]];
  if (!eid) throw new PacketServiceError("configuration");
  const client = createClient();
  const result = await client.fillPDF(eid, payload, { dataType: "buffer" });
  return validatePdfResponse(result);
}

export async function generateAnvilDocument(
  payload: HtmlDocument,
): Promise<Uint8Array> {
  const client = createClient();
  const result = await client.generatePDF(payload, { dataType: "buffer" });
  return validatePdfResponse(result);
}

function validatePdfResponse(result: {
  statusCode: number;
  data?: unknown;
}): Uint8Array {
  if (result.statusCode !== 200) {
    throw new PacketServiceError("generation");
  }
  const bytes =
    result.data instanceof Uint8Array
      ? result.data
      : Buffer.isBuffer(result.data)
        ? new Uint8Array(result.data)
        : null;
  if (
    !bytes ||
    bytes.byteLength < 5 ||
    String.fromCharCode(...bytes.slice(0, 5)) !== "%PDF-"
  ) {
    throw new PacketServiceError("invalid_pdf");
  }
  return bytes;
}
