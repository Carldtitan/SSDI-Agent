import type { ApplicantCase } from "@/lib/case/types";

export type DocumentKind =
  | "ssa16"
  | "ssa3368"
  | "ssa3369"
  | "ssa827"
  | "evidenceIndex";

export interface ConsistencyIssue {
  id: string;
  kind: "missing" | "unconfirmed" | "conflict" | "capacity";
  severity: "blocking" | "warning";
  paths: string[];
  message: string;
  affectedOutputs: DocumentKind[];
}

export function validateCrossForm(
  applicantCase: ApplicantCase,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const sharedOnset = applicantCase.eligibilityInput.allegedOnsetDate;
  if (!sharedOnset) {
    issues.push({
      id: "onset-missing",
      kind: "missing",
      severity: "blocking",
      paths: ["eligibilityInput.allegedOnsetDate"],
      message:
        "Confirm the date your conditions became severe enough to stop work.",
      affectedOutputs: ["ssa16", "ssa3368"],
    });
  }

  const conditionOnsets = applicantCase.conditions
    .map((condition) => condition.allegedOnsetDate)
    .filter((value) => value.provenance.state === "conflict");
  if (conditionOnsets.length > 0) {
    issues.push({
      id: "condition-onset-conflict",
      kind: "conflict",
      severity: "blocking",
      paths: ["conditions[].allegedOnsetDate"],
      message:
        "One or more condition dates need review before the forms are created.",
      affectedOutputs: ["ssa16", "ssa3368"],
    });
  }

  if (applicantCase.providers.length > 6) {
    issues.push({
      id: "provider-overflow",
      kind: "capacity",
      severity: "warning",
      paths: ["providers"],
      message: `${applicantCase.providers.length - 6} provider${
        applicantCase.providers.length - 6 === 1 ? "" : "s"
      } will continue on an additional sheet.`,
      affectedOutputs: ["ssa3368"],
    });
  }
  if (applicantCase.medications.length > 11) {
    issues.push({
      id: "medication-overflow",
      kind: "capacity",
      severity: "warning",
      paths: ["medications"],
      message: `${applicantCase.medications.length - 11} medication${
        applicantCase.medications.length - 11 === 1 ? "" : "s"
      } will continue on an additional sheet.`,
      affectedOutputs: ["ssa3368"],
    });
  }
  if (!applicantCase.providerCollectionComplete) {
    issues.push({
      id: "provider-list-open",
      kind: "unconfirmed",
      severity: "blocking",
      paths: ["providerCollectionComplete"],
      message: "Finish the provider list before creating the packet.",
      affectedOutputs: ["ssa3368", "ssa827", "evidenceIndex"],
    });
  }
  return issues;
}

export function partitionForForm<T>(
  items: readonly T[],
  capacity: number,
): { base: T[]; overflow: T[] } {
  return {
    base: items.slice(0, capacity),
    overflow: items.slice(capacity),
  };
}
