import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";

interface ExportResult {
  ok: boolean;
  canceled: boolean;
  path?: string;
  formCount?: number;
  evidenceCount?: number;
  missingCount?: number;
}

const require = createRequire(import.meta.url);
const { exportCaseFolder } = require("./case-export.cjs") as {
  exportCaseFolder(input: {
    archive: ArrayBuffer;
    applicantName: string;
    dialog: { showOpenDialog(): Promise<{ canceled: boolean; filePaths: string[] }> };
    linkedFiles: Array<{ fullPath: string; name: string }>;
    mainWindow: null;
    missingDocuments: Array<{ label: string; reason: string }>;
    shell: { openPath(value: string): Promise<string> };
  }): Promise<ExportResult>;
};

describe("case folder export", () => {
  it("creates five PDFs, copies linked evidence, and records missing evidence", async () => {
    const parent = await mkdtemp(path.join(tmpdir(), "ssdi-agent-case-export-"));
    try {
      const evidencePath = path.join(parent, "passport scan.jpg");
      await writeFile(evidencePath, "real evidence");
      const archive = zipSync(
        Object.fromEntries(
          [
            "01-SSA-16.pdf",
            "02-SSA-3368.pdf",
            "03-SSA-3369.pdf",
            "04-SSA-827.pdf",
            "05-Evidence-index.pdf",
          ].map((name) => [name, new TextEncoder().encode("%PDF-1.4")]),
        ),
      );
      let openedPath = "";
      const result = await exportCaseFolder({
        archive: archive.buffer.slice(
          archive.byteOffset,
          archive.byteOffset + archive.byteLength,
        ) as ArrayBuffer,
        applicantName: "Elena Rivera",
        dialog: {
          showOpenDialog: async () => ({ canceled: false, filePaths: [parent] }),
        },
        linkedFiles: [{ fullPath: evidencePath, name: "passport scan.jpg" }],
        mainWindow: null,
        missingDocuments: [{ label: "Birth certificate", reason: "Not found yet" }],
        shell: {
          openPath: async (value: string) => {
            openedPath = value;
            return "";
          },
        },
      });

      expect(result).toMatchObject({
        ok: true,
        canceled: false,
        formCount: 5,
        evidenceCount: 1,
        missingCount: 1,
      });
      expect(openedPath).toBe(result.path);
      const files = await readdir(result.path as string);
      expect(files.filter((name) => name.endsWith(".pdf"))).toHaveLength(5);
      expect(files).toContain("Supporting - passport scan.jpg");
      await expect(
        readFile(path.join(result.path as string, "Missing supporting documents.txt"), "utf8"),
      ).resolves.toContain("Birth certificate: Not found yet");
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });
});
