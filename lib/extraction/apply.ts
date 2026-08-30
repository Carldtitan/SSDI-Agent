import type { Dispatch } from "react";

import type {
  CanonicalValue,
  CaptureSource,
  CaseAction,
  Child,
  ClaimContact,
  Condition,
  Job,
  Marriage,
  MedicalTest,
  Medication,
  PhysicalDemands,
  PostalAddress,
  Provider,
  Provenance,
} from "@/lib/case/types";
import type {
  ExtractedFact,
  InterviewExtraction,
} from "@/lib/extraction/schema";

type IdFactory = (prefix: string) => string;
type EntityKind = Exclude<ExtractedFact["kind"], "scalar">;

interface ApplyExtractionOptions {
  createId?: IdFactory;
  source?: CaptureSource;
  confirmed?: boolean;
}

export function applyInterviewExtraction(
  dispatch: Dispatch<CaseAction>,
  extraction: InterviewExtraction,
  turnId: string,
  options: ApplyExtractionOptions = {},
) {
  const createId =
    options.createId ?? ((prefix) => `${prefix}-${crypto.randomUUID()}`);
  const source = options.source ?? "voice";
  const confirmed = options.confirmed ?? false;
  extraction.facts
    .filter(
      (fact) =>
        compatibleFact(fact) &&
        fact.kind === "scalar" &&
        !isAddressComponent(fact.field) &&
        !isRepeatedScalar(fact.field),
    )
    .forEach((fact) => {
      dispatch({
        type: "APPLY_CANDIDATE_PATCH",
        patch: {
          path: fact.field,
          value: scalarValue(fact),
          confidence: fact.confidence,
          evidenceText: fact.evidenceText,
          turnId,
          source,
          confirmed,
        },
      });
    });
  applyAddressScalars(
    dispatch,
    extraction.facts,
    turnId,
    source,
    confirmed,
  );
  applyRepeatedScalars(
    dispatch,
    extraction.facts,
    turnId,
    source,
    confirmed,
  );

  const grouped = groupEntities(
    extraction.facts.filter(
      (fact) => compatibleFact(fact) && fact.kind !== "scalar",
    ),
  );
  grouped.forEach((facts) => {
    const kind = facts[0].kind as EntityKind;
    switch (kind) {
      case "condition":
        dispatch({
          type: "ADD_ENTITY",
          collection: "conditions",
          entity: conditionFrom(facts, turnId, source, createId, confirmed),
        });
        break;
      case "provider":
        dispatch({
          type: "ADD_ENTITY",
          collection: "providers",
          entity: providerFrom(facts, turnId, source, createId, confirmed),
        });
        break;
      case "medication":
        dispatch({
          type: "ADD_ENTITY",
          collection: "medications",
          entity: medicationFrom(facts, turnId, source, createId, confirmed),
        });
        break;
      case "job":
        dispatch({
          type: "ADD_ENTITY",
          collection: "jobs",
          entity: jobFrom(facts, turnId, source, createId, confirmed),
        });
        break;
      case "marriage":
        dispatch({
          type: "ADD_ENTITY",
          collection: "marriages",
          entity: marriageFrom(facts, turnId, source, createId, confirmed),
        });
        break;
      case "child":
        dispatch({
          type: "ADD_ENTITY",
          collection: "children",
          entity: childFrom(facts, turnId, source, createId, confirmed),
        });
        break;
      case "claimContact":
        dispatch({
          type: "ADD_ENTITY",
          collection: "claimContacts",
          entity: claimContactFrom(
            facts,
            turnId,
            source,
            createId,
            confirmed,
          ),
        });
        break;
      case "medicalTest":
        dispatch({
          type: "ADD_ENTITY",
          collection: "medicalTests",
          entity: medicalTestFrom(
            facts,
            turnId,
            source,
            createId,
            confirmed,
          ),
        });
        break;
    }
  });

  if (extraction.providerListStatus !== "unknown") {
    dispatch({
      type: "SET_PROVIDER_COLLECTION_COMPLETE",
      complete: extraction.providerListStatus === "complete",
    });
  }
}

const scalarFields = new Set<ExtractedFact["field"]>([
  "applicant.legalName",
  "applicant.otherNames",
  "applicant.ssn",
  "applicant.dateOfBirth",
  "applicant.placeOfBirth",
  "applicant.citizenship",
  "applicant.preferredLanguage",
  "applicant.phone",
  "applicant.email",
  "applicant.addressLine1",
  "applicant.addressLine2",
  "applicant.city",
  "applicant.state",
  "applicant.zip",
  "education.highestLevel",
  "education.completionDate",
  "education.schoolName",
  "education.schoolAddressLine1",
  "education.schoolAddressLine2",
  "education.schoolCity",
  "education.schoolState",
  "education.schoolZip",
  "education.specialEducation",
  "education.specialEducationDetails",
  "education.training",
  "education.trainingFacility",
  "education.trainingFacilityPhone",
  "education.trainingAddressLine1",
  "education.trainingAddressLine2",
  "education.trainingCity",
  "education.trainingState",
  "education.trainingZip",
  "education.writtenLanguage",
  "servedInMilitary",
  "nonCitizen",
  "workedLastYear",
  "currentlyEarning",
  "bankDetailsReady",
  "otherPublicDisabilityBenefitsFiled",
  "otherPublicDisabilityBenefitTypes",
  "bankRoutingNumber",
  "bankAccountNumber",
  "bankAccountType",
  "directDepositRefused",
]);

function compatibleFact(fact: ExtractedFact): boolean {
  if (fact.kind === "scalar") return scalarFields.has(fact.field);
  return fact.field.startsWith(`${fact.kind}.`);
}

function groupEntities(facts: ExtractedFact[]): ExtractedFact[][] {
  const groups = new Map<string, ExtractedFact[]>();
  facts.forEach((fact) => {
    const key = `${fact.kind}:${fact.entityKey.trim().toLocaleLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), fact]);
  });
  return [...groups.values()];
}

function conditionFrom(
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  createId: IdFactory,
  confirmed: boolean,
): Condition {
  const confidence = lowestConfidence(facts);
  const value = <T>(candidateValue: T | null) =>
    candidate(candidateValue, confidence, turnId, source, confirmed);
  return {
    id: createId("condition"),
    name: value(one(facts, "condition.name")),
    allegedOnsetDate: value(one(facts, "condition.allegedOnsetDate")),
    symptoms: value(many(facts, "condition.symptom")),
    workEffects: value(many(facts, "condition.workEffect")),
  };
}

function providerFrom(
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  createId: IdFactory,
  confirmed: boolean,
): Provider {
  const confidence = lowestConfidence(facts);
  const address = providerAddress(facts);
  const value = <T>(candidateValue: T | null) =>
    candidate(candidateValue, confidence, turnId, source, confirmed);
  return {
    id: createId("provider"),
    name: value(one(facts, "provider.name")),
    facility: value(one(facts, "provider.facility")),
    specialty: value(one(facts, "provider.specialty")),
    address: value(address),
    phone: value(one(facts, "provider.phone")),
    firstTreatmentDate: value(one(facts, "provider.firstTreatmentDate")),
    lastTreatmentDate: value(one(facts, "provider.lastTreatmentDate")),
    nextAppointmentDate: value(one(facts, "provider.nextAppointmentDate")),
    conditionIds: [],
  };
}

function medicationFrom(
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  createId: IdFactory,
  confirmed: boolean,
): Medication {
  const confidence = lowestConfidence(facts);
  const value = <T>(candidateValue: T | null) =>
    candidate(candidateValue, confidence, turnId, source, confirmed);
  return {
    id: createId("medication"),
    name: value(one(facts, "medication.name")),
    dosage: value(one(facts, "medication.dosage")),
    frequency: value(one(facts, "medication.frequency")),
    prescriberProviderId: value<string>(null),
    reason: value(one(facts, "medication.reason")),
    sideEffects: value(many(facts, "medication.sideEffect")),
  };
}

function jobFrom(
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  createId: IdFactory,
  confirmed: boolean,
): Job {
  const confidence = lowestConfidence(facts);
  const value = <T>(candidateValue: T | null) =>
    candidate(candidateValue, confidence, turnId, source, confirmed);
  return {
    id: createId("job"),
    employer: value(one(facts, "job.employer")),
    title: value(one(facts, "job.title")),
    startDate: value(one(facts, "job.startDate")),
    endDate: value(one(facts, "job.endDate")),
    hoursPerDay: value(numberValue(facts, "job.hoursPerDay")),
    daysPerWeek: value(numberValue(facts, "job.daysPerWeek")),
    pay: value(numberValue(facts, "job.pay")),
    duties: value(many(facts, "job.duty")),
    physicalDemands: value(physicalDemandsFrom(facts)),
    toolsAndMachines: value(many(facts, "job.toolOrMachine")),
    supervision: value(one(facts, "job.supervision")),
    writingAndReports: value(one(facts, "job.writingAndReports")),
    reasonEnded: value(one(facts, "job.reasonEnded")),
  };
}

function marriageFrom(
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  createId: IdFactory,
  confirmed: boolean,
): Marriage {
  const confidence = lowestConfidence(facts);
  const value = <T>(candidateValue: T | null) =>
    candidate(candidateValue, confidence, turnId, source, confirmed);
  return {
    id: createId("marriage"),
    spouseName: value(one(facts, "marriage.spouseName")),
    startDate: value(one(facts, "marriage.startDate")),
    endDate: value(one(facts, "marriage.endDate")),
    endReason: value(one(facts, "marriage.endReason")),
  };
}

function childFrom(
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  createId: IdFactory,
  confirmed: boolean,
): Child {
  const confidence = lowestConfidence(facts);
  const value = <T>(candidateValue: T | null) =>
    candidate(candidateValue, confidence, turnId, source, confirmed);
  return {
    id: createId("child"),
    name: value(one(facts, "child.name")),
    dateOfBirth: value(one(facts, "child.dateOfBirth")),
    ssn: value(one(facts, "child.ssn")),
  };
}

function claimContactFrom(
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  createId: IdFactory,
  confirmed: boolean,
): ClaimContact {
  const confidence = lowestConfidence(facts);
  const value = <T>(candidateValue: T | null) =>
    candidate(candidateValue, confidence, turnId, source, confirmed);
  return {
    id: createId("claim-contact"),
    name: value(one(facts, "claimContact.name")),
    relationship: value(one(facts, "claimContact.relationship")),
    address: value(entityAddress(facts, "claimContact")),
    phone: value(one(facts, "claimContact.phone")),
    speaksEnglish: value(yesNoValue(facts, "claimContact.speaksEnglish")),
    preferredLanguage: value(one(facts, "claimContact.preferredLanguage")),
  };
}

function medicalTestFrom(
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  createId: IdFactory,
  confirmed: boolean,
): MedicalTest {
  const confidence = lowestConfidence(facts);
  const value = <T>(candidateValue: T | null) =>
    candidate(candidateValue, confidence, turnId, source, confirmed);
  return {
    id: createId("medical-test"),
    type: value(one(facts, "medicalTest.type")),
    bodyPart: value(one(facts, "medicalTest.bodyPart")),
    providerOrFacility: value(
      one(facts, "medicalTest.providerOrFacility"),
    ),
    date: value(one(facts, "medicalTest.date")),
  };
}

function physicalDemandsFrom(
  facts: ExtractedFact[],
): PhysicalDemands | null {
  const fields = [
    "job.lifting",
    "job.standingHours",
    "job.walkingHours",
    "job.sittingHours",
    "job.climbing",
    "job.stooping",
    "job.handling",
  ] satisfies ExtractedFact["field"][];
  const physicalFieldSet = new Set<ExtractedFact["field"]>(fields);
  if (!facts.some((fact) => physicalFieldSet.has(fact.field))) return null;
  return {
    lifting: one(facts, "job.lifting") ?? "",
    standingHours: numberValue(facts, "job.standingHours"),
    walkingHours: numberValue(facts, "job.walkingHours"),
    sittingHours: numberValue(facts, "job.sittingHours"),
    climbing: one(facts, "job.climbing") ?? "",
    stooping: one(facts, "job.stooping") ?? "",
    handling: one(facts, "job.handling") ?? "",
  };
}

function providerAddress(facts: ExtractedFact[]): PostalAddress | null {
  return entityAddress(facts, "provider");
}

function entityAddress(
  facts: ExtractedFact[],
  prefix: "provider" | "claimContact",
): PostalAddress | null {
  const line1 = one(facts, `${prefix}.addressLine1`);
  const city = one(facts, `${prefix}.city`);
  const state = one(facts, `${prefix}.state`);
  const zip = one(facts, `${prefix}.zip`);
  if (!line1 || !city || !state || !zip) return null;
  return {
    line1,
    line2: one(facts, `${prefix}.addressLine2`) ?? undefined,
    city,
    state,
    zip,
  };
}

function yesNoValue(
  facts: ExtractedFact[],
  field: ExtractedFact["field"],
): boolean | null {
  const value = one(facts, field)?.trim().toLocaleLowerCase();
  if (value === "yes" || value === "true") return true;
  if (value === "no" || value === "false") return false;
  return null;
}

function scalarValue(fact: ExtractedFact): string | string[] | boolean {
  if (
    fact.field === "applicant.otherNames" ||
    fact.field === "education.training" ||
    fact.field === "otherPublicDisabilityBenefitTypes"
  ) {
    return fact.value
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }
  if (
    [
      "servedInMilitary",
      "nonCitizen",
      "workedLastYear",
      "currentlyEarning",
      "bankDetailsReady",
      "otherPublicDisabilityBenefitsFiled",
      "directDepositRefused",
      "education.specialEducation",
    ].includes(fact.field)
  ) {
    return ["yes", "true"].includes(fact.value.trim().toLocaleLowerCase());
  }
  return fact.value;
}

const applicantAddressFields = [
  "applicant.addressLine1",
  "applicant.addressLine2",
  "applicant.city",
  "applicant.state",
  "applicant.zip",
] satisfies ExtractedFact["field"][];

const schoolAddressFields = [
  "education.schoolAddressLine1",
  "education.schoolAddressLine2",
  "education.schoolCity",
  "education.schoolState",
  "education.schoolZip",
] satisfies ExtractedFact["field"][];

const trainingAddressFields = [
  "education.trainingAddressLine1",
  "education.trainingAddressLine2",
  "education.trainingCity",
  "education.trainingState",
  "education.trainingZip",
] satisfies ExtractedFact["field"][];

function isAddressComponent(field: ExtractedFact["field"]) {
  return new Set<ExtractedFact["field"]>([
    ...applicantAddressFields,
    ...schoolAddressFields,
    ...trainingAddressFields,
  ]).has(
    field,
  );
}

function isRepeatedScalar(field: ExtractedFact["field"]) {
  return (
    field === "education.training" ||
    field === "otherPublicDisabilityBenefitTypes"
  );
}

function applyAddressScalars(
  dispatch: Dispatch<CaseAction>,
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  confirmed: boolean,
) {
  const definitions: Array<{
    path: string;
    line1: ExtractedFact["field"];
    line2: ExtractedFact["field"];
    city: ExtractedFact["field"];
    state: ExtractedFact["field"];
    zip: ExtractedFact["field"];
  }> = [
    {
      path: "applicant.address",
      line1: "applicant.addressLine1",
      line2: "applicant.addressLine2",
      city: "applicant.city",
      state: "applicant.state",
      zip: "applicant.zip",
    },
    {
      path: "education.schoolAddress",
      line1: "education.schoolAddressLine1",
      line2: "education.schoolAddressLine2",
      city: "education.schoolCity",
      state: "education.schoolState",
      zip: "education.schoolZip",
    },
    {
      path: "education.trainingFacilityAddress",
      line1: "education.trainingAddressLine1",
      line2: "education.trainingAddressLine2",
      city: "education.trainingCity",
      state: "education.trainingState",
      zip: "education.trainingZip",
    },
  ];
  definitions.forEach((definition) => {
    const addressFacts = facts.filter((fact) =>
      [
        definition.line1,
        definition.line2,
        definition.city,
        definition.state,
        definition.zip,
      ].includes(fact.field),
    );
    const line1 = one(addressFacts, definition.line1);
    const city = one(addressFacts, definition.city);
    const state = one(addressFacts, definition.state);
    const zip = one(addressFacts, definition.zip);
    if (!line1 || !city || !state || !zip) return;
    dispatch({
      type: "APPLY_CANDIDATE_PATCH",
      patch: {
        path: definition.path,
        value: {
          line1,
          line2: one(addressFacts, definition.line2) ?? undefined,
          city,
          state,
          zip,
        } satisfies PostalAddress,
        confidence: lowestConfidence(addressFacts),
        evidenceText: addressFacts.map((fact) => fact.evidenceText).join(" "),
        turnId,
        source,
        confirmed,
      },
    });
  });
}

function applyRepeatedScalars(
  dispatch: Dispatch<CaseAction>,
  facts: ExtractedFact[],
  turnId: string,
  source: CaptureSource,
  confirmed: boolean,
) {
  const definitions = [
    {
      field: "education.training",
      path: "education.training",
    },
    {
      field: "otherPublicDisabilityBenefitTypes",
      path: "otherPublicDisabilityBenefitTypes",
    },
  ] satisfies Array<{ field: ExtractedFact["field"]; path: string }>;
  definitions.forEach((definition) => {
    const matchingFacts = facts.filter(
      (fact) =>
        fact.kind === "scalar" && fact.field === definition.field,
    );
    if (!matchingFacts.length) return;
    dispatch({
      type: "APPLY_CANDIDATE_PATCH",
      patch: {
        path: definition.path,
        value: matchingFacts.map((fact) => fact.value),
        confidence: lowestConfidence(matchingFacts),
        evidenceText: matchingFacts
          .map((fact) => fact.evidenceText)
          .join(" "),
        turnId,
        source,
        confirmed,
      },
    });
  });
}

function one(facts: ExtractedFact[], field: ExtractedFact["field"]) {
  return facts.find((fact) => fact.field === field)?.value || null;
}

function many(facts: ExtractedFact[], field: ExtractedFact["field"]) {
  return facts.filter((fact) => fact.field === field).map((fact) => fact.value);
}

function numberValue(
  facts: ExtractedFact[],
  field: ExtractedFact["field"],
): number | null {
  const value = one(facts, field);
  if (value === null) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function lowestConfidence(facts: ExtractedFact[]) {
  return Math.min(...facts.map((fact) => fact.confidence));
}

function candidate<T>(
  value: T | null,
  confidence: number,
  turnId: string,
  source: CaptureSource,
  confirmed = false,
): CanonicalValue<T> {
  const provenance: Provenance = {
    source,
    state: value === null ? "missing" : confirmed ? "confirmed" : "unconfirmed",
    confidence,
    turnId,
    capturedAt: new Date().toISOString(),
  };
  return { value, provenance };
}
