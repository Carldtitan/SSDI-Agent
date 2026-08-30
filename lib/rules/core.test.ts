import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { syntheticApplicant } from "@/lib/case/seed";
import { evaluateCompleteness } from "@/lib/conversation/completeness";
import { buildDocumentChecklist } from "@/lib/rules/checklist";
import {
  addCalendarDays,
  authorizationWarningDue,
  evaluateRecordRequest,
} from "@/lib/rules/deadlines";
import { TRACKER_CONFIG } from "@/lib/rules/config";
import { partitionForForm, validateCrossForm } from "@/lib/rules/consistency";

describe("deterministic core", () => {
  it("Feature: ssdiAgent, Property 15: checklist is exact and deterministic", () => {
    const first = buildDocumentChecklist(syntheticApplicant);
    const second = buildDocumentChecklist(structuredClone(syntheticApplicant));
    expect(first).toEqual(second);
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
    expect(first.every((item) => item.ruleId && item.reason)).toBe(true);
  });

  it("Feature: ssdiAgent, Property 17: overflow is lossless", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer(), { maxLength: 40 }),
        fc.integer({ min: 0, max: 20 }),
        (items, capacity) => {
          const result = partitionForForm(items, capacity);
          expect([...result.base, ...result.overflow]).toEqual(items);
        },
      ),
    );
  });

  it("Feature: ssdiAgent, Property 22: deadline arithmetic is calendar-correct", () => {
    expect(addCalendarDays("2026-01-31", 30)).toBe("2026-03-02");
    expect(addCalendarDays("2024-02-01", 30)).toBe("2024-03-02");
    const action = evaluateRecordRequest(
      syntheticApplicant.recordRequests[1],
      "2026-07-28",
      TRACKER_CONFIG,
    );
    expect(action.state).toBe("day_20");
    expect(action.deadline).toBe("2026-08-05");
  });

  it("honors a written access extension before escalating", () => {
    const extendedRequest = {
      ...structuredClone(syntheticApplicant.recordRequests[1]),
      extensionNoticeAt: "2026-07-30",
    };
    const beforeExtendedDeadline = evaluateRecordRequest(
      extendedRequest,
      "2026-08-12",
      TRACKER_CONFIG,
    );
    const afterExtendedDeadline = evaluateRecordRequest(
      extendedRequest,
      "2026-09-04",
      TRACKER_CONFIG,
    );

    expect(beforeExtendedDeadline.state).toBe("day_20");
    expect(beforeExtendedDeadline.deadline).toBe("2026-09-04");
    expect(afterExtendedDeadline.state).toBe("day_30");
  });

  it("warns about the seeded SSA-827 at eleven months", () => {
    expect(
      authorizationWarningDue(
        syntheticApplicant.authorization.signedAt,
        "2026-07-28",
        TRACKER_CONFIG,
      ),
    ).toBe(true);
  });

  it("keeps the synthetic case packet-ready with no blocking issue", () => {
    const blocking = validateCrossForm(syntheticApplicant).filter(
      (issue) => issue.severity === "blocking",
    );
    expect(blocking).toEqual([]);
    expect(evaluateCompleteness(syntheticApplicant).ready).toBe(true);
  });

  it("keeps the demo work story and collection states internally coherent", () => {
    expect(syntheticApplicant.currentlyEarning.value).toBe(true);
    expect(syntheticApplicant.eligibilityInput.monthlyEarningsUsd).toBe(1480);
    expect(
      syntheticApplicant.jobs.some(
        (job) =>
          job.endDate.value === null &&
          job.reasonEnded.provenance.state === "not_applicable",
      ),
    ).toBe(true);
    expect(syntheticApplicant.collectionCompletion.marriages).toBe(
      "complete_none",
    );
    expect(syntheticApplicant.collectionCompletion.children).toBe(
      "complete_none",
    );
  });
});
