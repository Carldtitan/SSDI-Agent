import { describe, expect, it } from "vitest";

import { createEmptyApplicantCase } from "@/lib/case/empty";
import { caseReducer } from "@/lib/case/reducer";
import type { CaseAction } from "@/lib/case/types";
import { applyInterviewExtraction } from "@/lib/extraction/apply";
import {
  interviewExtractionSchema,
  type InterviewExtraction,
} from "@/lib/extraction/schema";

const extraction: InterviewExtraction = {
  summary: "Captured one condition and one provider.",
  followUpQuestion: "Was there anyone else?",
  providerListStatus: "more_possible",
  facts: [
    {
      kind: "scalar",
      entityKey: "",
      field: "applicant.legalName",
      value: "Jordan Lee",
      confidence: 0.99,
      evidenceText: "My name is Jordan Lee",
    },
    {
      kind: "condition",
      entityKey: "migraine",
      field: "condition.name",
      value: "chronic migraine",
      confidence: 0.94,
      evidenceText: "chronic migraines",
    },
    {
      kind: "condition",
      entityKey: "migraine",
      field: "condition.symptom",
      value: "light sensitivity",
      confidence: 0.92,
      evidenceText: "light hurts my eyes",
    },
    {
      kind: "provider",
      entityKey: "rivera",
      field: "provider.name",
      value: "Dr. Rivera",
      confidence: 0.9,
      evidenceText: "Dr. Rivera",
    },
  ],
};

describe("interview extraction boundary", () => {
  it("accepts schema-conforming candidate facts", () => {
    expect(interviewExtractionSchema.parse(extraction)).toEqual(extraction);
  });

  it("writes extracted values as unconfirmed candidates", () => {
    let applicantCase = createEmptyApplicantCase();
    const dispatch = (action: CaseAction) => {
      applicantCase = caseReducer(applicantCase, action);
    };

    applyInterviewExtraction(
      dispatch,
      extraction,
      "turn-1",
      { createId: (prefix) => `${prefix}-1` },
    );

    expect(applicantCase.applicant.legalName.value).toBe("Jordan Lee");
    expect(applicantCase.applicant.legalName.provenance.state).toBe(
      "unconfirmed",
    );
    expect(applicantCase.conditions).toHaveLength(1);
    expect(applicantCase.conditions[0].name.provenance.turnId).toBe("turn-1");
    expect(applicantCase.conditions[0].symptoms.value).toEqual([
      "light sensitivity",
    ]);
    expect(applicantCase.providers).toHaveLength(1);
    expect(applicantCase.providerCollectionComplete).toBe(false);
  });

  it("can confirm a canonical value inside a repeated collection", () => {
    let applicantCase = createEmptyApplicantCase();
    const dispatch = (action: CaseAction) => {
      applicantCase = caseReducer(applicantCase, action);
    };
    applyInterviewExtraction(
      dispatch,
      extraction,
      "turn-2",
      { createId: (prefix) => `${prefix}-2` },
    );

    applicantCase = caseReducer(applicantCase, {
      type: "CONFIRM_VALUE",
      path: "conditions.0.name",
    });

    expect(applicantCase.conditions[0].name.provenance.state).toBe("confirmed");
  });

  it("preserves typed provenance through scalar and repeated facts", () => {
    let applicantCase = createEmptyApplicantCase();
    const dispatch = (action: CaseAction) => {
      applicantCase = caseReducer(applicantCase, action);
    };

    applyInterviewExtraction(dispatch, extraction, "typed-turn", {
      createId: (prefix) => `${prefix}-typed`,
      source: "typed",
    });

    expect(applicantCase.applicant.legalName.provenance.source).toBe("typed");
    expect(applicantCase.conditions[0].name.provenance.source).toBe("typed");
    expect(applicantCase.providers[0].name.provenance.source).toBe("typed");
  });

  it("marks a candidate confirmed only after an explicit turn confirmation", () => {
    let applicantCase = createEmptyApplicantCase();
    const dispatch = (action: CaseAction) => {
      applicantCase = caseReducer(applicantCase, action);
    };

    applyInterviewExtraction(dispatch, extraction, "confirmed-turn", {
      confirmed: true,
      createId: (prefix) => `${prefix}-confirmed`,
      source: "voice",
    });

    expect(applicantCase.applicant.legalName.provenance.state).toBe(
      "confirmed",
    );
    expect(applicantCase.conditions[0].name.provenance.state).toBe(
      "confirmed",
    );
    expect(applicantCase.providers[0].name.provenance.state).toBe("confirmed");
  });

  it("maps spoken identity, education, family, and detailed work facts", () => {
    let applicantCase = createEmptyApplicantCase();
    const dispatch = (action: CaseAction) => {
      applicantCase = caseReducer(applicantCase, action);
    };
    const facts: InterviewExtraction["facts"] = [
      scalar("applicant.ssn", "REDACTED"),
      scalar("applicant.addressLine1", "REDACTED"),
      scalar("applicant.city", "Sacramento"),
      scalar("applicant.state", "CA"),
      scalar("applicant.zip", "95814"),
      scalar("education.highestLevel", "12"),
      scalar("education.specialEducation", "no"),
      scalar("education.training", "nurse aide certificate"),
      entity("marriage", "alex", "marriage.spouseName", "Alex Lee"),
      entity("child", "sam", "child.name", "Sam Lee"),
      entity("job", "care", "job.title", "Home health aide"),
      entity("job", "care", "job.standingHours", "6"),
      entity("job", "care", "job.lifting", "frequently lifted 25 pounds"),
      entity("job", "care", "job.toolOrMachine", "transfer belt"),
    ];

    applyInterviewExtraction(
      dispatch,
      {
        summary: "Application details",
        followUpQuestion: "",
        providerListStatus: "unknown",
        facts,
      },
      "turn-complete",
      { createId: (prefix) => `${prefix}-complete` },
    );

    expect(applicantCase.applicant.ssn.value).toBe("REDACTED");
    expect(applicantCase.applicant.address.value).toEqual({
      line1: "REDACTED",
      city: "Sacramento",
      state: "CA",
      zip: "95814",
    });
    expect(applicantCase.education.highestLevel.value).toBe("12");
    expect(applicantCase.education.specialEducation.value).toBe(false);
    expect(applicantCase.education.training.value).toEqual([
      "nurse aide certificate",
    ]);
    expect(applicantCase.marriages[0].spouseName.value).toBe("Alex Lee");
    expect(applicantCase.children[0].name.value).toBe("Sam Lee");
    expect(applicantCase.jobs[0].physicalDemands.value).toMatchObject({
      standingHours: 6,
      lifting: "frequently lifted 25 pounds",
    });
    expect(applicantCase.jobs[0].toolsAndMachines.value).toEqual([
      "transfer belt",
    ]);
  });

  it("maps a spoken claim contact and medical test", () => {
    let applicantCase = createEmptyApplicantCase();
    const dispatch = (action: CaseAction) => {
      applicantCase = caseReducer(applicantCase, action);
    };

    applyInterviewExtraction(
      dispatch,
      {
        summary: "Contact and MRI captured.",
        followUpQuestion: "",
        providerListStatus: "unknown",
        facts: [
          entity(
            "claimContact",
            "sofia",
            "claimContact.name",
            "Sofia Rivera",
          ),
          entity(
            "claimContact",
            "sofia",
            "claimContact.relationship",
            "sister",
          ),
          entity(
            "claimContact",
            "sofia",
            "claimContact.speaksEnglish",
            "yes",
          ),
          entity("medicalTest", "mri", "medicalTest.type", "MRI/CT scan"),
          entity("medicalTest", "mri", "medicalTest.bodyPart", "lumbar spine"),
          entity(
            "medicalTest",
            "mri",
            "medicalTest.providerOrFacility",
            "Mercy General Hospital",
          ),
          entity("medicalTest", "mri", "medicalTest.date", "2025-10-18"),
        ],
      },
      "turn-evidence",
      {
        confirmed: true,
        createId: (prefix) => `${prefix}-evidence`,
      },
    );

    expect(applicantCase.claimContacts[0].name.value).toBe("Sofia Rivera");
    expect(applicantCase.claimContacts[0].speaksEnglish.value).toBe(true);
    expect(applicantCase.medicalTests[0].type.value).toBe("MRI/CT scan");
    expect(applicantCase.medicalTests[0].bodyPart.value).toBe("lumbar spine");
  });
});

function scalar(
  field: Extract<
    InterviewExtraction["facts"][number]["field"],
    `applicant.${string}` | `education.${string}`
  >,
  value: string,
): InterviewExtraction["facts"][number] {
  return {
    kind: "scalar",
    entityKey: "",
    field,
    value,
    confidence: 0.98,
    evidenceText: value,
  };
}

function entity(
  kind: Exclude<InterviewExtraction["facts"][number]["kind"], "scalar">,
  entityKey: string,
  field: InterviewExtraction["facts"][number]["field"],
  value: string,
): InterviewExtraction["facts"][number] {
  return {
    kind,
    entityKey,
    field,
    value,
    confidence: 0.96,
    evidenceText: value,
  };
}
