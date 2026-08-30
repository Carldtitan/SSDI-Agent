import type { ApplicantCase } from "@/lib/case/types";
import { TRACKER_CONFIG } from "@/lib/rules/config";
import { evaluateRecordRequest } from "@/lib/rules/deadlines";

export interface HtmlDocument {
  title: string;
  type: "html";
  data: {
    html: string;
    css: string;
  };
}

const STATUS_LABELS = {
  not_requested: "Not requested",
  sent: "Sent",
  responded: "Received",
  silent: "No response",
} as const;

export function buildEvidenceIndex(
  applicantCase: ApplicantCase,
  today: string,
): HtmlDocument {
  const conditionNames = new Map(
    applicantCase.conditions.map((condition) => [
      condition.id,
      condition.name.value ?? "Condition not named",
    ]),
  );
  const requestByProvider = new Map(
    applicantCase.recordRequests.map((request) => [
      request.providerId,
      request,
    ]),
  );

  const rows = applicantCase.providers
    .map((provider) => {
      const request = requestByProvider.get(provider.id);
      const action = request
        ? evaluateRecordRequest(request, today, TRACKER_CONFIG)
        : null;
      const treatment = [provider.firstTreatmentDate.value, provider.lastTreatmentDate.value]
        .filter(Boolean)
        .join(" to ");
      return `<tr>
        <td><strong>${escapeHtml(provider.facility.value ?? provider.name.value ?? "Provider")}</strong><br><span>${escapeHtml(
          [provider.name.value, provider.specialty.value]
            .filter(Boolean)
            .join(" · ") || "Medical provider",
        )}</span></td>
        <td>${escapeHtml(
          provider.conditionIds
            .map((id) => conditionNames.get(id))
            .filter(Boolean)
            .join(", ") || "Relevant medical records",
        )}<br><span>${escapeHtml(treatment || "Treatment dates not confirmed")}</span></td>
        <td>${escapeHtml(request?.requestedAt ?? "Not requested")}</td>
        <td>${escapeHtml(action?.deadline ?? "—")}</td>
        <td><span class="status">${escapeHtml(request ? STATUS_LABELS[request.status] : STATUS_LABELS.not_requested)}</span></td>
      </tr>`;
    })
    .join("");

  return {
    title: "Medical Evidence Index",
    type: "html",
    data: {
      html: `
        <header>
          <p class="eyebrow">SSDI Agent</p>
          <h1>Medical evidence index</h1>
          <p class="summary">Prepared for ${escapeHtml(applicantCase.applicant.legalName.value ?? "applicant")} · Updated ${escapeHtml(today)}</p>
        </header>
        <section class="notice">
          <strong>Applicant working copy</strong>
          <span>This page tracks requests for the applicant's own records. It is not proof that SSA received the records.</span>
        </section>
        <table>
          <thead><tr><th>Provider</th><th>Records and period</th><th>Requested</th><th>Deadline</th><th>Status</th></tr></thead>
          <tbody>${rows || `<tr><td colspan="5">No providers have been added.</td></tr>`}</tbody>
        </table>
        <footer>Generated from the applicant's reviewed case. Dates and statuses should be checked before filing.</footer>
      `,
      css: `
        @page { size: Letter; margin: 0.6in; }
        * { box-sizing: border-box; }
        body { color: #261f24; font-family: "Noto Sans", Arial, sans-serif; font-size: 9.5px; line-height: 1.45; }
        header { border-bottom: 2px solid #8f315f; padding-bottom: 18px; margin-bottom: 18px; }
        .eyebrow { color: #8f315f; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; margin: 0 0 5px; text-transform: uppercase; }
        h1 { font-size: 25px; letter-spacing: -0.03em; margin: 0; }
        .summary { color: #665a62; margin: 5px 0 0; }
        .notice { background: #f8eef3; border-radius: 7px; display: flex; gap: 12px; margin-bottom: 18px; padding: 10px 12px; }
        .notice strong { color: #752449; white-space: nowrap; }
        table { border-collapse: collapse; table-layout: fixed; width: 100%; }
        th { background: #eee8eb; border-bottom: 1px solid #bdb3b8; font-size: 8px; letter-spacing: 0.05em; padding: 8px 7px; text-align: left; text-transform: uppercase; }
        td { border-bottom: 1px solid #ded7da; padding: 10px 7px; vertical-align: top; overflow-wrap: break-word; }
        th:nth-child(1), td:nth-child(1) { width: 22%; }
        th:nth-child(2), td:nth-child(2) { width: 28%; }
        th:nth-child(3), td:nth-child(3), th:nth-child(4), td:nth-child(4) { width: 16%; }
        th:nth-child(5), td:nth-child(5) { width: 18%; }
        td span { color: #665a62; }
        .status { color: #261f24; font-weight: 700; }
        footer { color: #665a62; font-size: 8px; margin-top: 18px; }
      `,
    },
  };
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return replacements[character];
  });
}
