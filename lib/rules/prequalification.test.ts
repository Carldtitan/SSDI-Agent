import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { EligibilityInput } from "@/lib/case/types";
import { SSA_RULES_2026 } from "@/lib/rules/config";
import {
  evaluatePrequalification,
  evaluateRecentWork,
  evaluateSga,
  requiredDurationCredits,
} from "@/lib/rules/prequalification";

const baseInput: EligibilityInput = {
  monthlyEarningsUsd: 1000,
  statutorilyBlind: false,
  impairmentRelatedWorkExpensesUsd: 0,
  employerSubsidyPossible: false,
  selfEmployed: false,
  selfEmploymentProfitUsd: null,
  passiveIncomeIncluded: false,
  conditionExpectedToLast12Months: true,
  conditionExpectedToResultInDeath: false,
  dateOfBirth: "1978-04-12",
  allegedOnsetDate: "2025-10-18",
  estimatedLifetimeCredits: 40,
  creditsLast3Years: 12,
  creditsLast10Years: 20,
  workedYearsAfter21BeforeOnset: 10,
};

describe("prequalification rules", () => {
  it("uses the configured 2026 values", () => {
    expect(SSA_RULES_2026).toMatchObject({
      effectiveYear: 2026,
      sgaMonthlyNonblindUsd: 1690,
      sgaMonthlyBlindUsd: 2830,
      earningsPerCreditUsd: 1890,
      earningsForFourCreditsUsd: 7560,
    });
  });

  it("Feature: ssdiAgent, Property 1: SGA is not an unconditional rejection", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1691, max: 20_000 }), (earnings) => {
        const result = evaluateSga(
          { ...baseInput, monthlyEarningsUsd: earnings },
          SSA_RULES_2026,
        );
        expect(result.status).toBe("needs_review");
        expect(`${result.title} ${result.reason}`.toLowerCase()).not.toMatch(
          /ineligible|denied|rejected/,
        );
      }),
    );
  });

  it("Feature: ssdiAgent, Property 2: blindness selects the applicable SGA threshold", () => {
    expect(
      evaluateSga(
        { ...baseInput, monthlyEarningsUsd: 2000, statutorilyBlind: false },
        SSA_RULES_2026,
      ).status,
    ).toBe("needs_review");
    expect(
      evaluateSga(
        { ...baseInput, monthlyEarningsUsd: 2000, statutorilyBlind: true },
        SSA_RULES_2026,
      ).status,
    ).toBe("looks_clear");
  });

  it("Feature: ssdiAgent, Property 3: self-employment never compares gross revenue", () => {
    const lowGross = evaluateSga(
      {
        ...baseInput,
        monthlyEarningsUsd: 100,
        selfEmployed: true,
        selfEmploymentProfitUsd: 500,
      },
      SSA_RULES_2026,
    );
    const highGross = evaluateSga(
      {
        ...baseInput,
        monthlyEarningsUsd: 100_000,
        selfEmployed: true,
        selfEmploymentProfitUsd: 500,
      },
      SSA_RULES_2026,
    );
    expect(highGross).toEqual(lowGross);
    expect(highGross.status).toBe("needs_review");
  });

  it("Feature: ssdiAgent, Properties 4-6: duration and recent work follow independent age rules", () => {
    expect(requiredDurationCredits(23, SSA_RULES_2026)).toBe(6);
    expect(requiredDurationCredits(34, SSA_RULES_2026)).toBe(12);
    expect(requiredDurationCredits(42, SSA_RULES_2026)).toBe(20);
    expect(requiredDurationCredits(62, SSA_RULES_2026)).toBe(40);

    expect(
      evaluateRecentWork({ ...baseInput, creditsLast3Years: 6 }, 23).status,
    ).toBe("looks_clear");
    expect(
      evaluateRecentWork({ ...baseInput, workedYearsAfter21BeforeOnset: 3 }, 27)
        .status,
    ).toBe("looks_clear");
    expect(
      evaluateRecentWork({ ...baseInput, creditsLast10Years: 20 }, 47).status,
    ).toBe("looks_clear");
  });

  it("Feature: ssdiAgent, Property 7: ambiguous credits remain uncertain", () => {
    const result = evaluatePrequalification(
      {
        ...baseInput,
        estimatedLifetimeCredits: null,
        creditsLast10Years: null,
      },
      SSA_RULES_2026,
    );
    expect(result.status).toBe("uncertain");
    expect(result.durationOfWork.nextAction).toContain("my Social Security");
    expect(result.recentWork.nextAction).toContain("my Social Security");
  });

  it("keeps the medical duration rule separate and non-blocking", () => {
    const result = evaluatePrequalification(
      {
        ...baseInput,
        conditionExpectedToLast12Months: false,
        conditionExpectedToResultInDeath: false,
      },
      SSA_RULES_2026,
    );
    expect(result.medicalDuration.status).toBe("needs_review");
    expect(result.medicalDuration.nextAction).toContain(
      "does not prevent an application",
    );
  });
});
