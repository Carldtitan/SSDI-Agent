import { describe, expect, it } from "vitest";

import { syntheticApplicant } from "@/lib/case/seed";
import { buildContinuationSheet } from "@/lib/documents/continuation";
import { buildEvidenceIndex } from "@/lib/documents/evidence-index";
import { generateRemarks } from "@/lib/documents/remarks";
import { buildFormPayloads } from "@/lib/forms/adapters";
import { adaptSsa827 } from "@/lib/forms/adapters/ssa827";
import { FORM_REGISTRY } from "@/lib/forms/registry";

describe("SSA form adapters", () => {
  it("covers every checked-in source field map and configured Anvil alias", () => {
    expect(FORM_REGISTRY).toEqual({
      ssa16: { sourceFieldCount: 140, configuredAliasCount: 114 },
      ssa3368: { sourceFieldCount: 426, configuredAliasCount: 336 },
      ssa3369: { sourceFieldCount: 377, configuredAliasCount: 320 },
      ssa827: { sourceFieldCount: 23, configuredAliasCount: 20 },
    });
  });

  it("builds four case-level payloads with one SSA-827", () => {
    const forms = buildFormPayloads(syntheticApplicant);
    expect(forms.map((form) => form.kind)).toEqual([
      "ssa16",
      "ssa3368",
      "ssa3369",
      "ssa827",
    ]);
    expect(forms.filter((form) => form.kind === "ssa827")).toHaveLength(1);
  });

  it("adds only an explicitly requested blank SSA-827 original", () => {
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.authorization.additionalBlankOriginalRequested = true;
    const forms = buildFormPayloads(applicantCase);
    const authorizations = forms.filter((form) => form.kind === "ssa827");

    expect(authorizations).toHaveLength(2);
    expect(authorizations[0].payload.data).not.toEqual({});
    expect(authorizations[1].label).toContain("additional blank original");
    expect(authorizations[1].payload.data).toEqual({
      nameFirstMiddleLastSuffix: { firstName: "", lastName: "" },
    });
  });

  it("reuses the same onset date across SSA-16 and SSA-3368", () => {
    const [ssa16, ssa3368] = buildFormPayloads(syntheticApplicant);
    expect(
      ssa16.payload.data.dateConditionBecameSevereEnoughToPreventWork,
    ).toBe("2025-10-18");
    expect(
      ssa3368.payload.data
        .conditionsBecameSevereDateStoppedForOtherReasons,
    ).toBe("2025-10-18");
  });

  it("maps the canonical education history into SSA-3368", () => {
    const [, ssa3368] = buildFormPayloads(syntheticApplicant);
    expect(ssa3368.payload.data["5AGrade12"]).toBe(true);
    expect(ssa3368.payload.data["5ADateCompletedMmYyyy"]).toBe("1996-06");
    expect(ssa3368.payload.data["5BSpecialEducation"]).toBe(
      "Special Education - No",
    );
    expect(ssa3368.payload.data.nameOfTrainingFacility).toBe(
      "Capitol Fresh Market",
    );
    expect(ssa3368.payload.data.writtenLanguageUsedEveryDay5D).toBe("English");
  });

  it("maps a claim contact and diagnostic test into SSA-3368", () => {
    const [, ssa3368] = buildFormPayloads(syntheticApplicant);
    expect(ssa3368.payload.data.contactAvailable).toBe(
      "Contact Available - Yes",
    );
    expect(ssa3368.payload.data.contactNameFirstMiddleInitialLast).toEqual({
      firstName: "Sofia",
      lastName: "Rivera",
    });
    expect(ssa3368.payload.data["8BMedicalTestsOrdered"]).toBe(
      "8.B. Yes (Select tests from chart below)",
    );
    expect(ssa3368.payload.data.mriCtScanBodyPart).toBe("Lumbar spine");
    expect(ssa3368.payload.data.mriCtScanHealthcareProviderOrFacility).toBe(
      "Mercy General Hospital",
    );
    expect(ssa3368.payload.data.mriCtScanDateOfTest).toBe("2025-10-18");
  });

  it("maps reviewed direct-deposit and public-benefit answers into SSA-16", () => {
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.otherPublicDisabilityBenefitsFiled.value = true;
    applicantCase.otherPublicDisabilityBenefitTypes.value = [
      "Veterans benefits",
      "workers' compensation",
    ];
    const [ssa16] = buildFormPayloads(applicantCase);

    expect(
      ssa16.payload.data.otherPublicDisabilityBenefitsFiledQ20A,
    ).toBe("Other Public Disability Benefits Filed - Yes");
    expect(
      ssa16.payload.data.otherPublicDisabilityBenefitsTypesQ20B,
    ).toBe("Veterans Administration Benefits");
    expect(ssa16.payload.data.accountType).toBe("Checking Account");
    expect(ssa16.payload.data.routingTransitNumber).toBe("121000248");
    expect(ssa16.payload.data.accountNumber).toBe("000123456789");
    expect(ssa16.payload.data.remarks).toContain("workers' compensation");
  });

  it("leaves SSA-827 SSA-only, signature, date, and witness fields blank", () => {
    const data = adaptSsa827(syntheticApplicant).payload.data;
    [
      "additionalInformationToIdentifySubjectOtherNamesSpecificSourceMaterialToBeDisclosed",
      "individualAuthorizingDisclosureSignature",
      "parentGuardianPersonalRepresentativeSignIfTwoSignaturesRequiredByStateLaw",
      "dateSigned",
      "witnessSignature",
      "secondWitnessSignature",
      "witnessPhoneNumberOrAddress",
      "secondWitnessPhoneNumberOrAddress",
    ].forEach((field) => {
      expect(data).not.toHaveProperty(field);
    });
  });

  it("does not create a continuation sheet when collections fit", () => {
    expect(buildContinuationSheet(syntheticApplicant)).toBeNull();
  });
});

describe("deterministic document companions", () => {
  it("creates an evidence row for every provider without invented dates", () => {
    const index = buildEvidenceIndex(syntheticApplicant, "2026-07-28");
    expect(index.data.html.match(/<tr>/g)).toHaveLength(
      syntheticApplicant.providers.length + 1,
    );
    expect(index.data.html).toContain("Dr. Maya Chen");
    expect(index.data.html).toContain("No response");
  });

  it("generates record-status remarks without AI", () => {
    const remarks = generateRemarks(syntheticApplicant);
    expect(remarks).toContain("Dr. Maya Chen: records received");
    expect(remarks).toContain("Dr. Simon Owens: no response yet");
  });

  it("preserves every overflow provider and medication in source order", () => {
    const expanded = structuredClone(syntheticApplicant);
    expanded.providers = Array.from({ length: 8 }, (_, index) => ({
      ...structuredClone(syntheticApplicant.providers[index % 3]),
      id: `provider-${index}`,
      facility: {
        ...structuredClone(syntheticApplicant.providers[0].facility),
        value: `Provider ${index + 1}`,
      },
    }));
    expanded.medications = Array.from({ length: 13 }, (_, index) => ({
      ...structuredClone(syntheticApplicant.medications[index % 2]),
      id: `med-${index}`,
      name: {
        ...structuredClone(syntheticApplicant.medications[0].name),
        value: `Medicine ${index + 1}`,
      },
    }));
    const continuation = buildContinuationSheet(expanded);
    expect(continuation?.data.html).toContain("Provider 7");
    expect(continuation?.data.html).toContain("Provider 8");
    expect(continuation?.data.html).toContain("Medicine 12");
    expect(continuation?.data.html).toContain("Medicine 13");
  });
});
