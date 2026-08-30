import { describe, expect, it } from "vitest";

import { createEmptyApplicantCase } from "@/lib/case/empty";
import { syntheticApplicant } from "@/lib/case/seed";
import { evaluateCompleteness } from "@/lib/conversation/completeness";

describe("completion engine", () => {
  it("blocks a new application on required facts and final review", () => {
    const result = evaluateCompleteness(createEmptyApplicantCase());

    expect(result.ready).toBe(false);
    expect(result.blocking.map((issue) => issue.id)).toContain(
      "question:legal-name",
    );
    expect(result.blocking.map((issue) => issue.id)).toContain("final-review");
  });

  it("accepts the complete synthetic application", () => {
    const result = evaluateCompleteness(structuredClone(syntheticApplicant));

    expect(result.ready).toBe(true);
    expect(result.blocking).toEqual([]);
    expect(result.progress).toBe(100);
  });

  it("requires an earnings amount only when the applicant is working", () => {
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.eligibilityInput.monthlyEarningsUsd = null;

    expect(
      evaluateCompleteness(applicantCase).blocking.map((issue) => issue.id),
    ).toContain("question:monthly-earnings");

    applicantCase.currentlyEarning.value = false;
    expect(
      evaluateCompleteness(applicantCase).blocking.map((issue) => issue.id),
    ).not.toContain("question:monthly-earnings");
  });

  it("accepts an explicit empty provider list", () => {
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.providers = [];
    applicantCase.providerCollectionComplete = true;
    applicantCase.collectionCompletion.providers = "complete_none";

    expect(
      evaluateCompleteness(applicantCase).blocking.map((issue) => issue.id),
    ).not.toContain("question:providers");
  });
});
