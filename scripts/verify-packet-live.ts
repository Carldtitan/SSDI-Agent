import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { syntheticApplicant } from "../lib/case/seed";

async function main() {
  const applicantCase = structuredClone(syntheticApplicant);
  applicantCase.conditions.forEach((condition) => {
    if (condition.allegedOnsetDate.provenance.state === "unconfirmed") {
      condition.allegedOnsetDate.provenance.state = "confirmed";
    }
  });
  applicantCase.authorization.additionalBlankOriginalRequested =
    process.env.INCLUDE_ADDITIONAL_SSA827 === "true";
  const response = await fetch(
    process.env.PACKET_TEST_URL ??
      "http://localhost:3000/api/packet/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(applicantCase),
    },
  );
  if (!response.ok) {
    throw new Error(`Packet endpoint returned ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const outputDirectory = path.join(process.cwd(), "output", "pdf");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "demo-ssdi-packet.pdf");
  await writeFile(outputPath, bytes);
  process.stdout.write(
    JSON.stringify({
      outputPath,
      pageCount: Number(response.headers.get("x-packet-pages")),
      documentCount: Number(response.headers.get("x-packet-documents")),
      byteLength: bytes.byteLength,
    }),
  );
}

main().catch(() => {
  process.stderr.write(
    "Live packet verification failed without exposing applicant data or provider diagnostics.",
  );
  process.exitCode = 1;
});
