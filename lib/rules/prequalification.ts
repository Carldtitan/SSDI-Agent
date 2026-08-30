import type { EligibilityInput } from "@/lib/case/types";
import type {
  DecisionStatus,
  RuleResult,
  SsaRuleConfig,
} from "@/lib/rules/types";

export interface PrequalificationResult {
  status: DecisionStatus;
  effectiveYear: number;
  ageAtOnset: number | null;
  sga: RuleResult;
  medicalDuration: RuleResult;
  durationOfWork: RuleResult;
  recentWork: RuleResult;
}

const MY_SSA_ACTION =
  "Check the Disability section of your my Social Security account for your earnings record and work-credit estimate.";

function yearsBetween(dateOfBirth: string, onsetDate: string): number | null {
  const birth = new Date(`${dateOfBirth}T00:00:00Z`);
  const onset = new Date(`${onsetDate}T00:00:00Z`);
  if (
    Number.isNaN(birth.valueOf()) ||
    Number.isNaN(onset.valueOf()) ||
    onset < birth
  ) {
    return null;
  }
  let age = onset.getUTCFullYear() - birth.getUTCFullYear();
  const onsetMonth = onset.getUTCMonth();
  const birthMonth = birth.getUTCMonth();
  if (
    onsetMonth < birthMonth ||
    (onsetMonth === birthMonth && onset.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}

export function requiredDurationCredits(
  ageAtOnset: number,
  config: SsaRuleConfig,
): number {
  if (ageAtOnset < config.durationOfWork[0].ageAtOnset) {
    return 6;
  }
  const last = config.durationOfWork.at(-1);
  if (!last) return 40;
  if (ageAtOnset >= last.ageAtOnset) return 40;

  for (let index = 0; index < config.durationOfWork.length - 1; index += 1) {
    const left = config.durationOfWork[index];
    const right = config.durationOfWork[index + 1];
    if (ageAtOnset >= left.ageAtOnset && ageAtOnset <= right.ageAtOnset) {
      const fraction =
        (ageAtOnset - left.ageAtOnset) / (right.ageAtOnset - left.ageAtOnset);
      const workYears =
        left.requiredWorkYears +
        fraction * (right.requiredWorkYears - left.requiredWorkYears);
      return Math.min(40, Math.ceil(workYears * 4));
    }
  }
  return 40;
}

export function evaluateSga(
  input: EligibilityInput,
  config: SsaRuleConfig,
): RuleResult {
  if (input.monthlyEarningsUsd === null || input.statutorilyBlind === null) {
    return {
      ruleId: "SGA-INPUT",
      status: "uncertain",
      title: "We need two more details",
      reason:
        "Monthly earnings and statutory blindness determine which work limit applies.",
      nextAction: "Add the missing earnings details.",
    };
  }

  if (input.selfEmployed === true) {
    if (input.selfEmploymentProfitUsd === null) {
      return {
        ruleId: "SGA-SELF-EMPLOYMENT",
        status: "uncertain",
        title: "Self-employment needs a closer look",
        reason:
          "SSA looks at business profit and applies additional work-activity tests—not gross revenue.",
        nextAction:
          "Add average monthly business profit and review SSA's self-employment rules.",
      };
    }
    return {
      ruleId: "SGA-SELF-EMPLOYMENT",
      status: "needs_review",
      title: "Self-employment needs review",
      reason:
        "SSA considers business profit and additional work-activity tests before deciding whether work is substantial.",
      nextAction:
        "Keep recent tax and business-work records with the application.",
    };
  }

  const threshold = input.statutorilyBlind
    ? config.sgaMonthlyBlindUsd
    : config.sgaMonthlyNonblindUsd;
  const irwe = Math.max(0, input.impairmentRelatedWorkExpensesUsd ?? 0);
  const countableEstimate = Math.max(0, input.monthlyEarningsUsd - irwe);
  const unresolvedException =
    input.impairmentRelatedWorkExpensesUsd === null ||
    input.employerSubsidyPossible === null ||
    input.selfEmployed === null ||
    input.passiveIncomeIncluded === null;
  const namedExceptions = [
    input.impairmentRelatedWorkExpensesUsd === null
      ? "disability-related work expenses"
      : null,
    input.employerSubsidyPossible === true ||
    input.employerSubsidyPossible === null
      ? "employer support or special conditions"
      : null,
    input.passiveIncomeIncluded === true || input.passiveIncomeIncluded === null
      ? "income that may not count as work earnings"
      : null,
  ].filter(Boolean);

  if (countableEstimate > threshold || input.employerSubsidyPossible === true) {
    return {
      ruleId: input.statutorilyBlind ? "SGA-2026-BLIND" : "SGA-2026-NONBLIND",
      status: "needs_review",
      title: "Possible work-income issue",
      reason: `Your estimated countable earnings are ${formatUsd(
        countableEstimate,
      )} a month. The ${config.effectiveYear} comparison amount is ${formatUsd(
        threshold,
      )}.${namedExceptions.length ? ` Review ${namedExceptions.join(" and ")} before relying on that comparison.` : ""}`,
      nextAction:
        "Confirm countable earnings and any work-related deductions or support before applying.",
    };
  }

  if (unresolvedException) {
    return {
      ruleId: "SGA-EXCEPTIONS",
      status: "uncertain",
      title: "The earnings estimate needs one more check",
      reason: `Your current estimate is below ${formatUsd(
        threshold,
      )}, but some work-income details are still unknown.`,
      nextAction: "Confirm the remaining work-income questions.",
    };
  }

  return {
    ruleId: input.statutorilyBlind ? "SGA-2026-BLIND" : "SGA-2026-NONBLIND",
    status: "looks_clear",
    title: "No clear SGA issue from these answers",
    reason: `Estimated countable earnings are below the ${config.effectiveYear} comparison amount of ${formatUsd(
      threshold,
    )} a month.`,
    nextAction: "Continue to the work-credit estimate.",
  };
}

export function evaluateDurationOfWork(
  input: EligibilityInput,
  config: SsaRuleConfig,
  ageAtOnset: number | null,
): RuleResult {
  if (ageAtOnset === null) {
    return {
      ruleId: "DURATION-INPUT",
      status: "uncertain",
      title: "Age at onset is unknown",
      reason:
        "Date of birth and disability onset date are needed for the lifetime work estimate.",
      nextAction: "Confirm both dates.",
    };
  }
  const required = requiredDurationCredits(ageAtOnset, config);
  if (input.estimatedLifetimeCredits === null) {
    return {
      ruleId: "DURATION-WORK",
      status: "uncertain",
      title: "Lifetime work credits need verification",
      reason: `At age ${ageAtOnset}, the estimate uses about ${required} lifetime work credits.`,
      nextAction: MY_SSA_ACTION,
    };
  }
  if (input.estimatedLifetimeCredits < required) {
    return {
      ruleId: "DURATION-WORK",
      status: "uncertain",
      title: "The lifetime-work estimate may be short",
      reason: `You estimated ${input.estimatedLifetimeCredits} credits; the age-based estimate is about ${required}. Self-reported credits are not an official insured-status decision.`,
      nextAction: MY_SSA_ACTION,
    };
  }
  return {
    ruleId: "DURATION-WORK",
    status: "looks_clear",
    title: "Lifetime-work estimate looks consistent",
    reason: `You estimated ${input.estimatedLifetimeCredits} credits against an age-based estimate of about ${required}.`,
    nextAction: "Check the recent-work estimate next.",
  };
}

export function evaluateMedicalDuration(input: EligibilityInput): RuleResult {
  if (
    input.conditionExpectedToLast12Months === true ||
    input.conditionExpectedToResultInDeath === true
  ) {
    return {
      ruleId: "MEDICAL-DURATION",
      status: "looks_clear",
      title: "The duration answer fits the basic rule",
      reason:
        "You said the condition has lasted or is expected to last at least 12 months, or is expected to result in death.",
      nextAction: "SSA still needs medical evidence and decides the claim.",
    };
  }
  if (
    input.conditionExpectedToLast12Months === false &&
    input.conditionExpectedToResultInDeath === false
  ) {
    return {
      ruleId: "MEDICAL-DURATION",
      status: "needs_review",
      title: "The 12-month duration rule needs review",
      reason:
        "Social Security generally requires a condition to last or be expected to last at least 12 months, or to result in death.",
      nextAction:
        "Confirm the expected duration with a treating medical source. This screen does not prevent an application.",
    };
  }
  return {
    ruleId: "MEDICAL-DURATION-INPUT",
    status: "uncertain",
    title: "Expected duration is still unknown",
    reason:
      "The basic disability definition includes a 12-month duration or expected-death requirement.",
    nextAction: "Confirm the expected duration before relying on this screen.",
  };
}

export function evaluateRecentWork(
  input: EligibilityInput,
  ageAtOnset: number | null,
): RuleResult {
  if (ageAtOnset === null) {
    return {
      ruleId: "RECENT-WORK-INPUT",
      status: "uncertain",
      title: "Age at onset is unknown",
      reason: "The recent-work rule changes with age at disability onset.",
      nextAction: "Confirm date of birth and onset date.",
    };
  }

  let enough: boolean | null;
  let reason: string;
  if (ageAtOnset < 24) {
    enough =
      input.creditsLast3Years === null ? null : input.creditsLast3Years >= 6;
    reason = "The estimate uses 6 credits in the 3 years before onset.";
  } else if (ageAtOnset <= 30) {
    const requiredYears = (ageAtOnset - 21) / 2;
    enough =
      input.workedYearsAfter21BeforeOnset === null
        ? null
        : input.workedYearsAfter21BeforeOnset >= requiredYears;
    reason = `The estimate uses work during about ${requiredYears.toFixed(
      1,
    )} years between age 21 and onset.`;
  } else {
    enough =
      input.creditsLast10Years === null ? null : input.creditsLast10Years >= 20;
    reason = "The estimate uses 20 credits in the 10 years before onset.";
  }

  if (enough === null) {
    return {
      ruleId: "RECENT-WORK",
      status: "uncertain",
      title: "Recent work needs verification",
      reason,
      nextAction: MY_SSA_ACTION,
    };
  }
  if (!enough) {
    return {
      ruleId: "RECENT-WORK",
      status: "uncertain",
      title: "The recent-work estimate may be short",
      reason: `${reason} Your self-reported history does not confirm that amount.`,
      nextAction: MY_SSA_ACTION,
    };
  }
  return {
    ruleId: "RECENT-WORK",
    status: "looks_clear",
    title: "Recent-work estimate looks consistent",
    reason,
    nextAction: "Continue to the application interview.",
  };
}

export function evaluatePrequalification(
  input: EligibilityInput,
  config: SsaRuleConfig,
): PrequalificationResult {
  const ageAtOnset =
    input.dateOfBirth && input.allegedOnsetDate
      ? yearsBetween(input.dateOfBirth, input.allegedOnsetDate)
      : null;
  const sga = evaluateSga(input, config);
  const medicalDuration = evaluateMedicalDuration(input);
  const durationOfWork = evaluateDurationOfWork(input, config, ageAtOnset);
  const recentWork = evaluateRecentWork(input, ageAtOnset);
  const statuses = [
    sga.status,
    medicalDuration.status,
    durationOfWork.status,
    recentWork.status,
  ];
  const status: DecisionStatus = statuses.includes("needs_review")
    ? "needs_review"
    : statuses.includes("uncertain")
      ? "uncertain"
      : "looks_clear";
  return {
    status,
    effectiveYear: config.effectiveYear,
    ageAtOnset,
    sga,
    medicalDuration,
    durationOfWork,
    recentWork,
  };
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}
