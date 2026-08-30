import "server-only";

import { PDFDocument } from "pdf-lib";

import { fillAnvilForm, generateAnvilDocument } from "@/lib/anvil/client";
import { collectReviewIssues } from "@/lib/case/review";
import type { ApplicantCase } from "@/lib/case/types";
import { buildContinuationSheet } from "@/lib/documents/continuation";
import { buildEvidenceIndex } from "@/lib/documents/evidence-index";
import { buildFormPayloads } from "@/lib/forms/adapters";
import { validateCrossForm } from "@/lib/rules/consistency";

export interface GeneratedPacket {
  bytes: Uint8Array;
  documentLabels: string[];
  pageCount: number;
}

export interface GeneratedDocumentFile {
  bytes: Uint8Array;
  fileName: string;
  label: string;
}

export async function generateDocumentPacket(
  applicantCase: ApplicantCase,
  today: string,
): Promise<GeneratedPacket> {
  const documents = await generateDocumentFiles(applicantCase, today);
  const merged = await PDFDocument.create();
  for (const document of documents) {
    const source = await PDFDocument.load(document.bytes);
    const pages = await merged.copyPages(source, source.getPageIndices());
    pages.forEach((page) => merged.addPage(page));
  }
  merged.setTitle("SSDI Agent SSDI application packet");
  merged.setAuthor("SSDI Agent");
  merged.setSubject("Applicant-prepared working copy");
  merged.setCreator("SSDI Agent with Anvil");
  const bytes = await merged.save({ useObjectStreams: false });

  return {
    bytes,
    documentLabels: documents.map((document) => document.label),
    pageCount: merged.getPageCount(),
  };
}

export async function generateDocumentFiles(
  applicantCase: ApplicantCase,
  today: string,
): Promise<GeneratedDocumentFile[]> {
  const reviewIssues = collectReviewIssues(applicantCase);
  const blockingIssues = validateCrossForm(applicantCase).filter(
    (issue) => issue.severity === "blocking",
  );
  if (reviewIssues.length > 0 || blockingIssues.length > 0) {
    throw new Error("packet_validation");
  }

  const forms = buildFormPayloads(applicantCase);
  const continuation = buildContinuationSheet(applicantCase);
  const evidenceIndex = buildEvidenceIndex(applicantCase, today);

  const kindCounts = new Map<string, number>();
  const jobs: Array<Promise<GeneratedDocumentFile>> = [
    ...forms.map(async (form) => {
      const occurrence = (kindCounts.get(form.kind) ?? 0) + 1;
      kindCounts.set(form.kind, occurrence);
      return {
      label: form.label,
      fileName: formFileName(form.kind, occurrence),
      bytes: await fillAnvilForm(form.kind, form.payload),
      };
    }),
    ...(continuation
      ? [
          generateAnvilDocument(continuation).then((bytes) => ({
            label: "Continuation sheet",
            fileName: "06-Continuation-sheet.pdf",
            bytes,
          })),
        ]
      : []),
    generateAnvilDocument(evidenceIndex).then((bytes) => ({
      label: "Medical evidence index",
      fileName: "05-Evidence-index.pdf",
      bytes,
    })),
  ];

  return Promise.all(jobs);
}

function formFileName(kind: string, occurrence: number) {
  const base = {
    ssa16: "01-SSA-16",
    ssa3368: "02-SSA-3368",
    ssa3369: "03-SSA-3369",
    ssa827: occurrence === 1 ? "04-SSA-827" : `04-SSA-827-extra-${occurrence - 1}`,
  }[kind];
  return `${base ?? "SSDI Agent-form"}.pdf`;
}
