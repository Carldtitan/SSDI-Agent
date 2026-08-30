import rawRules from "@/config/ssa-2026.json";
import type { SsaRuleConfig, TrackerConfig } from "@/lib/rules/types";

export const SSA_RULES_2026 = rawRules satisfies SsaRuleConfig;

export const TRACKER_CONFIG: TrackerConfig = {
  accessDeadlineDays: 30,
  allowedExtensionDays: 30,
  reminderDay: 20,
  escalationDay: 30,
  authorizationValidityMonths: 12,
  authorizationWarningMonths: 11,
};
