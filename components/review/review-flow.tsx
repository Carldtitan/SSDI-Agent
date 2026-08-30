"use client";

import {
  Activity,
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleAlert,
  ClipboardList,
  Pencil,
  Pill,
  Stethoscope,
  Trash2,
  UserRound,
  UsersRound,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useApplicantCase } from "@/components/app/case-context";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/form-controls";
import { useVoiceTurn } from "@/components/voice/use-voice-turn";
import type {
  CanonicalValue,
  CaptureSource,
  ConfirmationState,
} from "@/lib/case/types";
import { collectReviewIssues } from "@/lib/case/review";
import { validateCrossForm } from "@/lib/rules/consistency";
import { parseYesNo } from "@/lib/voice/answer-parsers";
import { cn } from "@/lib/utils";

type ReviewSection =
  | "applicant"
  | "conditions"
  | "providers"
  | "medications"
  | "evidence"
  | "work"
  | "family";

interface ReviewSectionItem {
  id: ReviewSection;
  label: string;
  icon: LucideIcon;
  pathPrefix: string;
}

const sections: ReviewSectionItem[] = [
  {
    id: "applicant",
    label: "Applicant",
    icon: UserRound,
    pathPrefix: "applicant.",
  },
  {
    id: "conditions",
    label: "Conditions",
    icon: Activity,
    pathPrefix: "conditions.",
  },
  {
    id: "providers",
    label: "Providers",
    icon: Stethoscope,
    pathPrefix: "providers.",
  },
  {
    id: "medications",
    label: "Medications",
    icon: Pill,
    pathPrefix: "medications.",
  },
  {
    id: "evidence",
    label: "Contacts & tests",
    icon: ClipboardList,
    pathPrefix: "medicalTests.",
  },
  {
    id: "work",
    label: "Work",
    icon: BriefcaseBusiness,
    pathPrefix: "jobs.",
  },
  {
    id: "family",
    label: "Family",
    icon: UsersRound,
    pathPrefix: "family.",
  },
];

export function ReviewFlow() {
  const { applicantCase, dispatch, voiceSessionActive } = useApplicantCase();
  const voice = useVoiceTurn();
  const voiceReviewStartedRef = useRef(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const issues = useMemo(
    () => collectReviewIssues(applicantCase),
    [applicantCase],
  );
  const consistencyIssues = useMemo(
    () => validateCrossForm(applicantCase),
    [applicantCase],
  );
  const blockingConsistency = consistencyIssues.filter(
    (issue) => issue.severity === "blocking",
  );
  const initialSection =
    sections.find((section) =>
      issues.some((issue) => issueBelongsToSection(issue.path, section)),
    )?.id ?? "applicant";
  const [activeSection, setActiveSection] =
    useState<ReviewSection>(initialSection);
  const ready = issues.length === 0 && blockingConsistency.length === 0;

  async function runVoiceReview() {
    try {
      await voice.activate();
      if (!ready) {
        const count = issues.length + blockingConsistency.length;
        const message = `I found ${count} ${
          count === 1 ? "detail" : "details"
        } that still need your decision. They are highlighted on this screen.`;
        setVoiceMessage(message);
        await voice.speak(message);
        return;
      }
      setVoiceMessage("The review is clear. Listening for your next step.");
      const answer = await voice.ask(
        "Your confirmed answers have no unresolved conflicts, and the provider list is complete. Should I build your filing packet now?",
      );
      const parsed = parseYesNo(answer);
      if (parsed.ok && parsed.value) {
        dispatch({ type: "SET_STAGE", stage: "packet" });
      } else {
        setVoiceMessage("Packet building is paused until you are ready.");
      }
    } catch (reviewError) {
      setVoiceMessage(
        reviewError instanceof Error
          ? reviewError.message
          : "Voice review paused. The visible controls still work.",
      );
    }
  }

  useEffect(() => {
    if (!voiceSessionActive || voiceReviewStartedRef.current) return;
    voiceReviewStartedRef.current = true;
    void runVoiceReview();
    // Voice continuation is intentionally triggered once on stage entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionActive]);

  return (
    <div className="mx-auto w-full max-w-[72rem] pb-24 pt-3 sm:pt-7">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-primary">
            Review · Before forms
          </p>
          <h1 className="mt-2 max-w-[16ch] text-4xl font-bold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
            Make sure the packet says what you mean.
          </h1>
          {voiceSessionActive && voiceMessage ? (
            <p
              aria-live="polite"
              className="mt-4 flex max-w-[40rem] items-center gap-2 text-sm font-bold text-primary"
            >
              <Volume2 aria-hidden="true" className="size-4" />
              {voiceMessage}
            </p>
          ) : null}
        </div>
        <ReviewSummary
          blockingCount={blockingConsistency.length}
          issueCount={issues.length}
          ready={ready}
        />
      </header>

      <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-10">
        <nav
          aria-label="Review sections"
          className="min-w-0 max-w-[calc(100vw-2rem)] overflow-hidden lg:max-w-none"
        >
          <div className="flex max-w-full gap-1 overflow-x-auto pb-2 lg:grid lg:overflow-visible">
            {sections.map((section) => {
              const Icon = section.icon;
              const issueCount = issues.filter((issue) =>
                issueBelongsToSection(issue.path, section),
              ).length;
              return (
                <button
                  aria-current={
                    activeSection === section.id ? "page" : undefined
                  }
                  className={cn(
                    "flex min-h-11 shrink-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-3 font-bold transition-colors",
                    activeSection === section.id
                      ? "bg-primary-soft text-primary"
                      : "text-muted hover:bg-surface-subtle hover:text-foreground",
                  )}
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  type="button"
                >
                  <Icon aria-hidden="true" className="size-4" />
                  {section.label}
                  {issueCount ? (
                    <span className="ml-auto grid size-5 place-items-center rounded-full bg-warning-soft text-xs text-warning">
                      {issueCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </nav>

        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="w-full min-w-0 max-w-full overflow-hidden rounded-[var(--radius-surface)] border border-border bg-surface shadow-[0_18px_60px_oklch(0_0_0/0.045)]"
          initial={{ opacity: 0, y: 5 }}
          key={activeSection}
          transition={{ duration: 0.18 }}
        >
          <SectionHeading section={activeSection} />
          {activeSection === "applicant" ? (
            <ApplicantReview applicantCase={applicantCase} />
          ) : null}
          {activeSection === "conditions" ? (
            <ConditionsReview applicantCase={applicantCase} />
          ) : null}
          {activeSection === "providers" ? (
            <ProvidersReview applicantCase={applicantCase} />
          ) : null}
          {activeSection === "medications" ? (
            <MedicationsReview applicantCase={applicantCase} />
          ) : null}
          {activeSection === "evidence" ? (
            <EvidenceDetailsReview applicantCase={applicantCase} />
          ) : null}
          {activeSection === "work" ? (
            <WorkReview applicantCase={applicantCase} />
          ) : null}
          {activeSection === "family" ? (
            <FamilyReview applicantCase={applicantCase} />
          ) : null}
        </motion.section>
      </div>

      <div className="mt-7 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted">
          {ready
            ? "Everything shown here is ready to map into the packet."
            : "Resolve highlighted details before building the packet."}
        </p>
        <Button
          disabled={!ready}
          onClick={() => dispatch({ type: "SET_STAGE", stage: "packet" })}
        >
          Build my packet
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function issueBelongsToSection(
  path: string,
  section: ReviewSectionItem,
): boolean {
  if (section.id === "applicant") {
    return (
      path.startsWith("applicant.") ||
      [
        "otherPublicDisabilityBenefitsFiled",
        "otherPublicDisabilityBenefitTypes",
        "bankDetailsReady",
        "bankRoutingNumber",
        "bankAccountNumber",
        "bankAccountType",
        "directDepositRefused",
      ].includes(path)
    );
  }
  if (section.id === "family") {
    return [
      "marriages.",
      "children.",
      "servedInMilitary",
      "nonCitizen",
    ].some((prefix) => path.startsWith(prefix));
  }
  if (section.id === "evidence") {
    return ["claimContacts.", "medicalTests."].some((prefix) =>
      path.startsWith(prefix),
    );
  }
  return path.startsWith(section.pathPrefix);
}

function ReviewSummary({
  blockingCount,
  issueCount,
  ready,
}: {
  blockingCount: number;
  issueCount: number;
  ready: boolean;
}) {
  if (ready) {
    return (
      <p className="flex items-center gap-2 font-bold text-success">
        <span className="grid size-8 place-items-center rounded-full bg-success-soft">
          <Check aria-hidden="true" className="size-4" />
        </span>
        Ready to build
      </p>
    );
  }
  const count = issueCount + blockingCount;
  return (
    <p className="flex items-center gap-2 font-bold text-warning">
      <span className="grid size-8 place-items-center rounded-full bg-warning-soft">
        <CircleAlert aria-hidden="true" className="size-4" />
      </span>
      {count} {count === 1 ? "detail needs" : "details need"} you
    </p>
  );
}

function SectionHeading({ section }: { section: ReviewSection }) {
  const copy: Record<ReviewSection, [string, string]> = {
    applicant: ["Applicant", "Identity and contact details"],
    conditions: ["Conditions", "Symptoms, dates, and effects on work"],
    providers: ["Providers", "Every practitioner, clinic, and hospital"],
    medications: ["Medications", "Dose, frequency, reason, and side effects"],
    evidence: ["Contacts and tests", "People who can help and diagnostic tests"],
    work: ["Work history", "Jobs and why work ended"],
    family: ["Family and service", "Details that affect supporting documents"],
  };
  return (
    <header className="border-b border-border px-5 py-4 sm:px-6">
      <h2 className="text-xl font-bold">{copy[section][0]}</h2>
      <p className="mt-0.5 text-sm text-muted">{copy[section][1]}</p>
    </header>
  );
}

type ApplicantCaseValue = ReturnType<typeof useApplicantCase>["applicantCase"];

function ApplicantReview({
  applicantCase,
}: {
  applicantCase: ApplicantCaseValue;
}) {
  return (
    <div>
      <ReviewValue
        label="Legal name"
        path="applicant.legalName"
        value={applicantCase.applicant.legalName}
      />
      <ReviewValue
        label="Date of birth"
        path="applicant.dateOfBirth"
        value={applicantCase.applicant.dateOfBirth}
      />
      <ReviewValue
        label="Phone"
        path="applicant.phone"
        value={applicantCase.applicant.phone}
      />
      <ReviewValue
        label="Email"
        path="applicant.email"
        value={applicantCase.applicant.email}
      />
      <ReviewValue
        label="Citizenship"
        path="applicant.citizenship"
        value={applicantCase.applicant.citizenship}
      />
      <ReviewValue
        label="Other disability programs"
        path="otherPublicDisabilityBenefitTypes"
        value={applicantCase.otherPublicDisabilityBenefitTypes}
      />
      <ReviewValue
        label="Bank account type"
        path="bankAccountType"
        value={applicantCase.bankAccountType}
      />
      <ReviewValue
        label="Routing number"
        path="bankRoutingNumber"
        value={applicantCase.bankRoutingNumber}
      />
      <ReviewValue
        label="Account number"
        path="bankAccountNumber"
        value={applicantCase.bankAccountNumber}
      />
    </div>
  );
}

function ConditionsReview({
  applicantCase,
}: {
  applicantCase: ApplicantCaseValue;
}) {
  const { dispatch } = useApplicantCase();
  if (!applicantCase.conditions.length)
    return <EmptyReview noun="conditions" />;
  return (
    <div>
      {applicantCase.conditions.map((condition, index) => (
        <article
          className="border-b border-border last:border-b-0"
          key={condition.id}
        >
          <EntityHeading
            name={condition.name.value || `Condition ${index + 1}`}
            onRemove={() => {
              if (
                window.confirm(
                  "Remove this condition from every form and continuation sheet?",
                )
              ) {
                dispatch({
                  type: "DELETE_ENTITY",
                  collection: "conditions",
                  id: condition.id,
                });
              }
            }}
          />
          <ReviewValue
            label="Onset date"
            path={`conditions.${index}.allegedOnsetDate`}
            value={condition.allegedOnsetDate}
          />
          <ReviewValue
            label="Symptoms"
            path={`conditions.${index}.symptoms`}
            value={condition.symptoms}
          />
          <ReviewValue
            label="Effect on work"
            path={`conditions.${index}.workEffects`}
            value={condition.workEffects}
          />
        </article>
      ))}
    </div>
  );
}

function ProvidersReview({
  applicantCase,
}: {
  applicantCase: ApplicantCaseValue;
}) {
  const { dispatch } = useApplicantCase();
  if (!applicantCase.providers.length) return <EmptyReview noun="providers" />;
  const possibleDuplicates = possibleDuplicateProviderIds(
    applicantCase.providers,
  );
  return (
    <div>
      {applicantCase.providers.map((provider, index) => (
        <article
          className="border-b border-border last:border-b-0"
          key={provider.id}
        >
          <EntityHeading
            name={provider.name.value || `Provider ${index + 1}`}
            onRemove={() => {
              if (
                window.confirm(
                  "Remove this provider from the forms, evidence index, and record tracker?",
                )
              ) {
                dispatch({
                  type: "DELETE_ENTITY",
                  collection: "providers",
                  id: provider.id,
                });
              }
            }}
          />
          {possibleDuplicates.has(provider.id) ? (
            <p className="flex gap-2 border-b border-warning/20 bg-warning-soft/55 px-5 py-3 text-sm leading-relaxed text-warning sm:px-6">
              <CircleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              Possible duplicate. Confirm both if they are separate sources, or
              remove this one if it repeats another provider.
            </p>
          ) : null}
          <ReviewValue
            label="Facility"
            path={`providers.${index}.facility`}
            value={provider.facility}
          />
          <ReviewValue
            label="Specialty"
            path={`providers.${index}.specialty`}
            value={provider.specialty}
          />
          <ReviewValue
            label="Phone"
            path={`providers.${index}.phone`}
            value={provider.phone}
          />
          <ReviewValue
            label="First visit"
            path={`providers.${index}.firstTreatmentDate`}
            value={provider.firstTreatmentDate}
          />
          <ReviewValue
            label="Last visit"
            path={`providers.${index}.lastTreatmentDate`}
            value={provider.lastTreatmentDate}
          />
        </article>
      ))}
    </div>
  );
}

function MedicationsReview({
  applicantCase,
}: {
  applicantCase: ApplicantCaseValue;
}) {
  const { dispatch } = useApplicantCase();
  if (!applicantCase.medications.length) {
    return <EmptyReview noun="medications" />;
  }
  return (
    <div>
      {applicantCase.medications.map((medication, index) => (
        <article
          className="border-b border-border last:border-b-0"
          key={medication.id}
        >
          <EntityHeading
            name={medication.name.value || `Medication ${index + 1}`}
            onRemove={() => {
              if (
                window.confirm(
                  "Remove this medication from every form and continuation sheet?",
                )
              ) {
                dispatch({
                  type: "DELETE_ENTITY",
                  collection: "medications",
                  id: medication.id,
                });
              }
            }}
          />
          <ReviewValue
            label="Dose"
            path={`medications.${index}.dosage`}
            value={medication.dosage}
          />
          <ReviewValue
            label="Frequency"
            path={`medications.${index}.frequency`}
            value={medication.frequency}
          />
          <ReviewValue
            label="Reason"
            path={`medications.${index}.reason`}
            value={medication.reason}
          />
          <ReviewValue
            label="Side effects"
            path={`medications.${index}.sideEffects`}
            value={medication.sideEffects}
          />
        </article>
      ))}
    </div>
  );
}

function WorkReview({ applicantCase }: { applicantCase: ApplicantCaseValue }) {
  if (!applicantCase.jobs.length) return <EmptyReview noun="jobs" />;
  return (
    <div>
      {applicantCase.jobs.map((job, index) => (
        <article
          className="border-b border-border last:border-b-0"
          key={job.id}
        >
          <EntityHeading name={job.title.value || `Job ${index + 1}`} />
          <ReviewValue
            label="Employer"
            path={`jobs.${index}.employer`}
            value={job.employer}
          />
          <ReviewValue
            label="Dates"
            path={`jobs.${index}.startDate`}
            value={job.startDate}
          />
          <ReviewValue
            label="Duties"
            path={`jobs.${index}.duties`}
            value={job.duties}
          />
          <ReviewValue
            label="Why it ended"
            path={`jobs.${index}.reasonEnded`}
            value={job.reasonEnded}
          />
        </article>
      ))}
    </div>
  );
}

function EvidenceDetailsReview({
  applicantCase,
}: {
  applicantCase: ApplicantCaseValue;
}) {
  return (
    <div>
      {applicantCase.claimContacts.length ? (
        applicantCase.claimContacts.map((contact, index) => (
          <article
            className="border-b border-border last:border-b-0"
            key={contact.id}
          >
            <EntityHeading
              name={contact.name.value || `Contact ${index + 1}`}
            />
            <ReviewValue
              label="Relationship"
              path={`claimContacts.${index}.relationship`}
              value={contact.relationship}
            />
            <ReviewValue
              label="Phone"
              path={`claimContacts.${index}.phone`}
              value={contact.phone}
            />
            <ReviewValue
              label="Preferred language"
              path={`claimContacts.${index}.preferredLanguage`}
              value={contact.preferredLanguage}
            />
          </article>
        ))
      ) : (
        <StaticCount label="Backup contacts" value={0} />
      )}
      {applicantCase.medicalTests.length ? (
        applicantCase.medicalTests.map((test, index) => (
          <article
            className="border-b border-border last:border-b-0"
            key={test.id}
          >
            <EntityHeading
              name={test.type.value || `Medical test ${index + 1}`}
            />
            <ReviewValue
              label="Body part"
              path={`medicalTests.${index}.bodyPart`}
              value={test.bodyPart}
            />
            <ReviewValue
              label="Facility"
              path={`medicalTests.${index}.providerOrFacility`}
              value={test.providerOrFacility}
            />
            <ReviewValue
              label="Date"
              path={`medicalTests.${index}.date`}
              value={test.date}
            />
          </article>
        ))
      ) : (
        <StaticCount label="Medical tests" value={0} />
      )}
    </div>
  );
}

function FamilyReview({
  applicantCase,
}: {
  applicantCase: ApplicantCaseValue;
}) {
  return (
    <div>
      <ReviewValue
        label="Military service"
        path="servedInMilitary"
        value={applicantCase.servedInMilitary}
      />
      <ReviewValue
        label="Non-citizen"
        path="nonCitizen"
        value={applicantCase.nonCitizen}
      />
      <StaticCount label="Marriages" value={applicantCase.marriages.length} />
      <StaticCount label="Children" value={applicantCase.children.length} />
    </div>
  );
}

function EntityHeading({
  name,
  onRemove,
}: {
  name: string;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center justify-between bg-surface-subtle/70 px-5 py-3 sm:px-6">
      <h3 className="font-bold">{name}</h3>
      {onRemove ? (
        <Button
          aria-label={`Remove ${name}`}
          onClick={onRemove}
          size="small"
          variant="quiet"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Remove</span>
        </Button>
      ) : null}
    </div>
  );
}

function ReviewValue({
  label,
  path,
  value,
}: {
  label: string;
  path: string;
  value: CanonicalValue<unknown>;
}) {
  const { dispatch } = useApplicantCase();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(formatForEdit(value.value));
  const needsReview =
    value.provenance.state === "unconfirmed" ||
    value.provenance.state === "conflict";
  const canEdit =
    typeof value.value === "string" ||
    Array.isArray(value.value) ||
    value.value === null;

  function saveEdit() {
    const nextValue = Array.isArray(value.value)
      ? draft
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean)
      : draft.trim() || null;
    dispatch({ type: "EDIT_VALUE", path, value: nextValue });
    setEditing(false);
  }

  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-center sm:gap-2 sm:px-6",
        needsReview && "bg-warning-soft/45",
      )}
    >
      <p className="col-start-1 text-sm font-bold text-muted sm:col-auto">
        {label}
      </p>
      <div className="col-start-1 min-w-0 sm:col-auto">
        {editing ? (
          <input
            aria-label={`Edit ${label}`}
            className={inputClassName}
            onChange={(event) => setDraft(event.currentTarget.value)}
            value={draft}
          />
        ) : (
          <p className="break-words font-bold leading-relaxed">
            {formatValue(value.value)}
          </p>
        )}
        {!editing ? <ValueStatus provenance={value.provenance} /> : null}
      </div>
      <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-2 sm:col-auto sm:row-auto sm:row-span-1 sm:justify-end">
        {editing ? (
          <>
            <Button onClick={saveEdit} size="small">
              Save
            </Button>
            <Button
              onClick={() => {
                setDraft(formatForEdit(value.value));
                setEditing(false);
              }}
              size="small"
              variant="quiet"
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            {needsReview ? (
              <Button
                onClick={() => dispatch({ type: "CONFIRM_VALUE", path })}
                size="small"
              >
                <Check aria-hidden="true" className="size-4" />
                Confirm
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                aria-label={`Edit ${label}`}
                onClick={() => setEditing(true)}
                size="icon"
                variant="quiet"
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function ValueStatus({
  provenance,
}: {
  provenance: {
    source: CaptureSource;
    state: ConfirmationState;
  };
}) {
  const copy: Record<ConfirmationState, string> = {
    missing: "Not provided",
    unconfirmed: "Needs confirmation",
    confirmed: provenance.source === "seed" ? "Demo fact" : "Confirmed",
    conflict: "Conflicting answer",
    not_applicable: "Not applicable",
  };
  return (
    <p
      className={cn(
        "mt-0.5 text-xs text-muted",
        provenance.state === "unconfirmed" && "font-bold text-warning",
        provenance.state === "conflict" && "font-bold text-danger",
      )}
    >
      {copy[provenance.state]}
    </p>
  );
}

function StaticCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[10rem_1fr] sm:px-6">
      <p className="text-sm font-bold text-muted">{label}</p>
      <p className="font-bold">{value || "None listed"}</p>
    </div>
  );
}

function EmptyReview({ noun }: { noun: string }) {
  return (
    <p className="px-5 py-10 text-center text-muted sm:px-6">
      No {noun} are listed yet.
    </p>
  );
}

function formatForEdit(value: unknown): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "Not provided";
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(" · ") : "None";
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>)
      .filter(Boolean)
      .join(", ");
  }
  return String(value);
}

function possibleDuplicateProviderIds(
  providers: ApplicantCaseValue["providers"],
): Set<string> {
  const duplicateIds = new Set<string>();
  providers.forEach((provider, index) => {
    const name = normalized(provider.name.value);
    const facility = normalized(provider.facility.value);
    providers.slice(0, index).forEach((earlier) => {
      const sameName =
        name.length > 0 && name === normalized(earlier.name.value);
      const sameFacility =
        facility.length > 0 && facility === normalized(earlier.facility.value);
      if (sameName || sameFacility) {
        duplicateIds.add(earlier.id);
        duplicateIds.add(provider.id);
      }
    });
  });
  return duplicateIds;
}

function normalized(value: string | null): string {
  return (value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}
