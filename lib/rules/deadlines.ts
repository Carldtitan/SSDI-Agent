import type { RecordRequest } from "@/lib/case/types";
import type { TrackerConfig } from "@/lib/rules/types";

export type RecordActionState =
  | "portal_first"
  | "wait"
  | "day_20"
  | "day_30"
  | "responded";

export interface RecordAction {
  state: RecordActionState;
  deadline: string | null;
  daysSinceRequest: number | null;
  label: string;
  script?: string;
  escalationOptions?: string[];
}

export function addCalendarDays(date: string, days: number): string {
  const parsed = parseDateOnly(date);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function daysBetween(start: string, end: string): number {
  return Math.floor(
    (parseDateOnly(end).valueOf() - parseDateOnly(start).valueOf()) /
      86_400_000,
  );
}

export function evaluateRecordRequest(
  request: RecordRequest,
  today: string,
  config: TrackerConfig,
): RecordAction {
  if (request.status === "responded") {
    return {
      state: "responded",
      deadline: request.requestedAt ? deadlineFor(request, config) : null,
      daysSinceRequest: request.requestedAt
        ? daysBetween(request.requestedAt, today)
        : null,
      label: "Records received",
    };
  }
  if (!request.requestedAt) {
    return {
      state: "portal_first",
      deadline: null,
      daysSinceRequest: null,
      label: request.portalAvailable
        ? "Check the patient portal first"
        : "Send your records request",
    };
  }

  const deadline = deadlineFor(request, config);
  const elapsed = daysBetween(request.requestedAt, today);
  const escalationDay = request.extensionNoticeAt
    ? config.accessDeadlineDays + config.allowedExtensionDays
    : config.escalationDay;
  if (elapsed >= escalationDay) {
    return {
      state: "day_30",
      deadline,
      daysSinceRequest: elapsed,
      label: "Deadline passed—escalate",
      script: rightOfAccessScript(request.providerDisplayName),
      escalationOptions: [
        "Ask for the records supervisor",
        "Request written extension details",
        "File an HHS Office for Civil Rights complaint",
      ],
    };
  }
  if (elapsed >= config.reminderDay) {
    return {
      state: "day_20",
      deadline,
      daysSinceRequest: elapsed,
      label: "Follow up now",
      script: rightOfAccessScript(request.providerDisplayName),
    };
  }
  return {
    state: "wait",
    deadline,
    daysSinceRequest: elapsed,
    label: "Waiting for records",
  };
}

export function authorizationWarningDue(
  signedAt: string | null,
  today: string,
  config: TrackerConfig,
): boolean {
  if (!signedAt) return false;
  const signed = parseDateOnly(signedAt);
  const warning = new Date(signed);
  warning.setUTCMonth(
    warning.getUTCMonth() + config.authorizationWarningMonths,
  );
  return parseDateOnly(today) >= warning;
}

function deadlineFor(request: RecordRequest, config: TrackerConfig): string {
  if (!request.requestedAt) {
    throw new Error("A request date is required to calculate a deadline.");
  }
  return addCalendarDays(
    request.requestedAt,
    config.accessDeadlineDays +
      (request.extensionNoticeAt ? config.allowedExtensionDays : 0),
  );
}

function rightOfAccessScript(providerName: string): string {
  return `Hi, I'm following up on my request for my own records from ${providerName} under the HIPAA Right of Access. The request has a 30-day response period. Please send the records by secure email or through the patient portal. I understand you may charge a reasonable copy cost, but not a retrieval fee. What is the status of my request?`;
}

function parseDateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) {
    throw new Error(`Invalid date-only value: ${value}`);
  }
  return date;
}
