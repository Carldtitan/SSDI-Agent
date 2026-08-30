import type { ApplicantCase } from "@/lib/case/types";

export interface ChecklistItem {
  id: string;
  label: string;
  reason: string;
  ruleId: string;
  status: "needed" | "ready" | "not_available" | "follow_up" | "obtained";
}

export function buildDocumentChecklist(
  applicantCase: ApplicantCase,
): ChecklistItem[] {
  const items: ChecklistItem[] = [
    item(
      "birth-certificate",
      "Birth certificate",
      "CHECKLIST-ALWAYS",
      "SSA uses it to verify identity and age.",
    ),
    item(
      "ssn",
      "Social Security number",
      "CHECKLIST-ALWAYS",
      "It connects the application to the correct earnings record.",
    ),
    item(
      "photo-id",
      "Photo ID",
      "CHECKLIST-ALWAYS",
      "It helps verify identity.",
    ),
    item(
      "banking",
      "Bank routing and account numbers",
      "CHECKLIST-ALWAYS",
      "SSA uses them for direct deposit if benefits are approved.",
    ),
  ];

  if (applicantCase.servedInMilitary.value) {
    items.push(
      item(
        "dd214",
        "DD-214",
        "CHECKLIST-MILITARY",
        "It documents military service that may affect the claim.",
      ),
    );
  }
  if (applicantCase.marriages.length > 0) {
    items.push(
      item(
        "marriage-certificate",
        "Marriage certificate",
        "CHECKLIST-MARRIAGE",
        "It helps SSA evaluate spouse-related benefits.",
      ),
    );
  }
  if (
    applicantCase.marriages.some((marriage) => {
      if (!marriage.startDate.value || !marriage.endDate.value) return false;
      const start = new Date(`${marriage.startDate.value}T00:00:00Z`);
      const end = new Date(`${marriage.endDate.value}T00:00:00Z`);
      return (
        end.valueOf() - start.valueOf() >= 10 * 365.25 * 24 * 60 * 60 * 1000
      );
    })
  ) {
    items.push(
      item(
        "divorce-decree",
        "Divorce decree",
        "CHECKLIST-DIVORCE-10Y",
        "A marriage lasting at least 10 years may affect benefit eligibility.",
      ),
    );
  }
  const onsetYear = applicantCase.eligibilityInput.allegedOnsetDate
    ? Number(applicantCase.eligibilityInput.allegedOnsetDate.slice(0, 4))
    : 2026;
  if (
    applicantCase.children.some((child) => {
      if (!child.dateOfBirth.value) return false;
      return onsetYear - Number(child.dateOfBirth.value.slice(0, 4)) < 18;
    })
  ) {
    items.push(
      item(
        "child-records",
        "Children's birth certificates and Social Security numbers",
        "CHECKLIST-CHILD",
        "A child under 18 may qualify for benefits on the applicant's record.",
      ),
    );
  }
  if (applicantCase.workedLastYear.value) {
    items.push(
      item(
        "prior-year-work",
        "Last year's W-2 or self-employment tax records",
        "CHECKLIST-PRIOR-WORK",
        "They help verify recent covered earnings.",
      ),
    );
  }
  if (applicantCase.currentlyEarning.value) {
    items.push(
      item(
        "current-earnings",
        "Recent pay stubs or business-profit records",
        "CHECKLIST-CURRENT-EARNINGS",
        "SSA needs current countable work earnings.",
      ),
    );
  }
  if (applicantCase.nonCitizen.value) {
    items.push(
      item(
        "immigration",
        "Immigration documents",
        "CHECKLIST-NONCITIZEN",
        "They help SSA verify eligible immigration status.",
      ),
    );
  }
  return Array.from(
    new Map(items.map((entry) => [entry.id, entry])).values(),
  ).map((entry) => ({
    ...entry,
    status: applicantCase.documentReadiness[entry.id] ?? entry.status,
  }));
}

function item(
  id: string,
  label: string,
  ruleId: string,
  reason: string,
): ChecklistItem {
  return { id, label, ruleId, reason, status: "needed" };
}
