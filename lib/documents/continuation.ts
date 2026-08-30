import type { ApplicantCase } from "@/lib/case/types";
import { escapeHtml, type HtmlDocument } from "@/lib/documents/evidence-index";
import { partitionForForm } from "@/lib/rules/consistency";

export function buildContinuationSheet(
  applicantCase: ApplicantCase,
): HtmlDocument | null {
  const providers = partitionForForm(applicantCase.providers, 6).overflow;
  const medications = partitionForForm(applicantCase.medications, 11).overflow;
  const jobs = partitionForForm(applicantCase.jobs, 5).overflow;
  if (providers.length + medications.length + jobs.length === 0) return null;

  const sections = [
    providers.length > 0
      ? section(
          "SSA-3368, Section 8A - additional healthcare providers",
          providers.map(
            (provider, index) =>
              `<article><h3>Provider ${index + 7}: ${escapeHtml(provider.facility.value ?? provider.name.value ?? "Name not confirmed")}</h3><p>${escapeHtml(
                [
                  provider.specialty.value,
                  provider.phone.value,
                  formatAddress(provider.address.value),
                  dateRange(
                    provider.firstTreatmentDate.value,
                    provider.lastTreatmentDate.value,
                  ),
                ]
                  .filter(Boolean)
                  .join(" · "),
              )}</p></article>`,
          ),
        )
      : "",
    medications.length > 0
      ? section(
          "SSA-3368, Section 7 - additional medicines",
          medications.map(
            (medication, index) =>
              `<article><h3>Medicine ${index + 12}: ${escapeHtml(medication.name.value ?? "Name not confirmed")}</h3><p>${escapeHtml(
                [
                  medication.dosage.value,
                  medication.frequency.value,
                  medication.reason.value,
                ]
                  .filter(Boolean)
                  .join(" · "),
              )}</p></article>`,
          ),
        )
      : "",
    jobs.length > 0
      ? section(
          "SSA-3369, Section 3 - additional jobs",
          jobs.map(
            (job, index) =>
              `<article><h3>Job ${index + 6}: ${escapeHtml(job.title.value ?? "Title not confirmed")}</h3><p>${escapeHtml(
                [
                  job.employer.value,
                  dateRange(job.startDate.value, job.endDate.value),
                  job.duties.value?.join("; "),
                ]
                  .filter(Boolean)
                  .join(" · "),
              )}</p></article>`,
          ),
        )
      : "",
  ].join("");

  return {
    title: "SSDI Application Continuation Sheet",
    type: "html",
    data: {
      html: `
        <header><p>SSDI APPLICATION CONTINUATION SHEET</p><h1>${escapeHtml(applicantCase.applicant.legalName.value ?? "Applicant")}</h1><span>SSN ending ${escapeHtml(applicantCase.applicant.ssn.value?.slice(-4) ?? "not provided")}</span></header>
        ${sections}
        <footer>Every item continues the referenced form section in source order.</footer>
      `,
      css: `
        @page { size: Letter; margin: 0.65in; }
        * { box-sizing: border-box; }
        body { color: #261f24; font-family: "Noto Sans", Arial, sans-serif; font-size: 10px; line-height: 1.5; }
        header { border-bottom: 2px solid #8f315f; margin-bottom: 22px; padding-bottom: 15px; }
        header p { color: #8f315f; font-size: 8px; font-weight: 700; letter-spacing: .1em; margin: 0; }
        h1 { font-size: 20px; margin: 4px 0 2px; }
        header span, footer { color: #665a62; font-size: 8px; }
        section { break-inside: avoid; margin-bottom: 22px; }
        h2 { background: #eee8eb; font-size: 11px; margin: 0; padding: 8px 10px; }
        article { border-bottom: 1px solid #ded7da; padding: 9px 10px; }
        h3 { font-size: 10px; margin: 0 0 3px; }
        article p { color: #4f464c; margin: 0; }
        footer { margin-top: 20px; }
      `,
    },
  };
}

function section(title: string, entries: string[]): string {
  return `<section><h2>${escapeHtml(title)}</h2>${entries.join("")}</section>`;
}

function formatAddress(
  address: ApplicantCase["applicant"]["address"]["value"],
): string | null {
  if (!address) return null;
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.zip,
  ]
    .filter(Boolean)
    .join(", ");
}

function dateRange(start: string | null, end: string | null): string | null {
  if (!start && !end) return null;
  return [start ?? "unknown", end ?? "present"].join(" to ");
}

