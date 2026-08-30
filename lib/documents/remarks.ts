import type { ApplicantCase, RecordRequest } from "@/lib/case/types";
import { partitionForForm } from "@/lib/rules/consistency";

function latestStatusDate(request: RecordRequest): string | null {
  return (
    request.respondedAt ??
    request.extensionNoticeAt ??
    request.requestedAt ??
    null
  );
}

export function generateRemarks(applicantCase: ApplicantCase): string {
  const lines: string[] = [];
  const providerOverflow = partitionForForm(applicantCase.providers, 6).overflow;
  const medicationOverflow = partitionForForm(
    applicantCase.medications,
    11,
  ).overflow;

  if (providerOverflow.length > 0) {
    lines.push(
      `See the attached continuation sheet for ${providerOverflow.length} additional healthcare provider${providerOverflow.length === 1 ? "" : "s"}.`,
    );
  }
  if (medicationOverflow.length > 0) {
    lines.push(
      `See the attached continuation sheet for ${medicationOverflow.length} additional medication${medicationOverflow.length === 1 ? "" : "s"}.`,
    );
  }

  applicantCase.recordRequests
    .filter((request) => request.requestedAt)
    .forEach((request) => {
      const date = latestStatusDate(request);
      const status =
        request.status === "responded"
          ? "records received"
          : request.status === "silent"
            ? "no response yet"
            : request.status === "sent"
              ? "request sent"
              : "not requested";
      lines.push(
        `${request.providerDisplayName}: ${status}${date ? ` as of ${date}` : ""}.`,
      );
    });

  return lines.join("\n");
}

