import type {
  ApplicantCase,
  CanonicalValue,
  ConfirmationState,
} from "@/lib/case/types";

export interface ReviewIssue {
  path: string;
  state: Extract<ConfirmationState, "unconfirmed" | "conflict">;
  value: CanonicalValue<unknown>;
}

export function collectReviewIssues(
  applicantCase: ApplicantCase,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];
  walk(applicantCase, "", issues);
  return issues.sort((left, right) => {
    if (left.state === right.state) return left.path.localeCompare(right.path);
    return left.state === "conflict" ? -1 : 1;
  });
}

function walk(value: unknown, path: string, issues: ReviewIssue[]) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      walk(entry, path ? `${path}.${index}` : String(index), issues),
    );
    return;
  }
  if (!isRecord(value)) return;

  if (isCanonicalValue(value)) {
    if (
      value.provenance.state === "unconfirmed" ||
      value.provenance.state === "conflict"
    ) {
      issues.push({
        path,
        state: value.provenance.state,
        value,
      });
    }
    return;
  }

  Object.entries(value).forEach(([key, entry]) => {
    walk(entry, path ? `${path}.${key}` : key, issues);
  });
}

function isCanonicalValue(value: unknown): value is CanonicalValue<unknown> {
  if (!isRecord(value)) return false;
  return isRecord(value.provenance) && "state" in value.provenance;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
