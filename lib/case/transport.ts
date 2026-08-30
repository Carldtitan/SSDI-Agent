import { z } from "zod";

import type { ApplicantCase } from "@/lib/case/types";

const provenanceSchema = z
  .object({
    source: z.enum(["voice", "typed", "seed"]),
    state: z.enum([
      "missing",
      "unconfirmed",
      "confirmed",
      "conflict",
      "not_applicable",
    ]),
    capturedAt: z.string(),
  })
  .passthrough();

const canonicalSchema = z
  .object({
    value: z.unknown().nullable(),
    provenance: provenanceSchema,
  })
  .passthrough();

export const applicantCaseTransportSchema = z
  .object({
    caseId: z.string().min(1).max(100),
    mode: z.enum(["synthetic_demo", "session"]),
    stage: z.enum([
      "application",
      "documents",
      "records",
      "check",
      "interview",
      "review",
      "packet",
    ]),
    conversationLocale: z.enum(["en-US", "es-US", "zh-CN"]).nullable(),
    applicationPhase: z.enum([
      "language",
      "introduction",
      "document_readiness",
      "intake",
      "issue_resolution",
      "completion_review",
      "ready",
    ]),
    applicant: z
      .object({
        legalName: canonicalSchema,
        ssn: canonicalSchema,
        dateOfBirth: canonicalSchema,
      })
      .passthrough(),
    eligibilityInput: z
      .object({
        allegedOnsetDate: z.string().nullable(),
      })
      .passthrough(),
    conditions: z.array(z.unknown()).max(50),
    providers: z.array(z.unknown()).max(50),
    medications: z.array(z.unknown()).max(100),
    jobs: z.array(z.unknown()).max(50),
    marriages: z.array(z.unknown()).max(20),
    children: z.array(z.unknown()).max(50),
    education: z.record(z.string(), z.unknown()),
    recordRequests: z.array(z.unknown()).max(50),
    providerCollectionComplete: z.boolean(),
    revision: z.number().int().nonnegative(),
  })
  .passthrough();

export function parseApplicantCase(value: unknown): ApplicantCase {
  return applicantCaseTransportSchema.parse(value) as unknown as ApplicantCase;
}
