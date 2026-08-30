export type DecisionStatus = "looks_clear" | "needs_review" | "uncertain";

export interface RuleResult {
  ruleId: string;
  status: DecisionStatus;
  title: string;
  reason: string;
  nextAction?: string;
}

export interface SsaRuleConfig {
  effectiveYear: number;
  sgaMonthlyNonblindUsd: number;
  sgaMonthlyBlindUsd: number;
  earningsPerCreditUsd: number;
  earningsForFourCreditsUsd: number;
  durationOfWork: ReadonlyArray<{
    ageAtOnset: number;
    requiredWorkYears: number;
  }>;
}

export interface TrackerConfig {
  accessDeadlineDays: number;
  allowedExtensionDays: number;
  reminderDay: number;
  escalationDay: number;
  authorizationValidityMonths: number;
  authorizationWarningMonths: number;
}
