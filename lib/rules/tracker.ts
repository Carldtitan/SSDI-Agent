import type { ApplicantCase, RecordRequest } from "@/lib/case/types";
import { TRACKER_CONFIG } from "@/lib/rules/config";
import {
  evaluateRecordRequest,
  type RecordAction,
} from "@/lib/rules/deadlines";

export interface TrackerItem {
  request: RecordRequest;
  action: RecordAction;
}

const ACTION_PRIORITY: Record<RecordAction["state"], number> = {
  day_30: 0,
  day_20: 1,
  portal_first: 2,
  wait: 3,
  responded: 4,
};

export function buildTrackerItems(
  applicantCase: ApplicantCase,
  today: string,
): TrackerItem[] {
  return applicantCase.recordRequests
    .map((request) => ({
      request,
      action: evaluateRecordRequest(request, today, TRACKER_CONFIG),
    }))
    .sort((left, right) => {
      const stateOrder =
        ACTION_PRIORITY[left.action.state] - ACTION_PRIORITY[right.action.state];
      if (stateOrder !== 0) return stateOrder;
      return left.request.providerDisplayName.localeCompare(
        right.request.providerDisplayName,
      );
    });
}

export function trackerToday(applicantCase: ApplicantCase): string {
  return applicantCase.mode === "synthetic_demo"
    ? "2026-07-28"
    : new Date().toISOString().slice(0, 10);
}

