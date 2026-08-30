import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  CaseProvider,
  useApplicantCase,
} from "@/components/app/case-context";
import { RecordsTracker } from "@/components/records/records-tracker";
import { syntheticApplicant } from "@/lib/case/seed";
import { buildTrackerItems } from "@/lib/rules/tracker";

const voiceMocks = vi.hoisted(() => ({
  activate: vi.fn(),
  ask: vi.fn(),
  speak: vi.fn(),
}));

vi.mock("@/components/voice/use-voice-turn", () => ({
  useVoiceTurn: () => ({
    ...voiceMocks,
    error: null,
    finishAnswer: vi.fn(),
    lastTranscript: "",
    level: 0,
    listen: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    state: "idle",
  }),
}));

beforeEach(() => {
  voiceMocks.activate.mockReset().mockResolvedValue(undefined);
  voiceMocks.ask.mockReset();
  voiceMocks.speak.mockReset().mockResolvedValue(undefined);
});

describe("records tracker", () => {
  it("sorts the demo into overdue, day-22 follow-up, and received states", () => {
    const items = buildTrackerItems(syntheticApplicant, "2026-07-28");
    expect(items.map((item) => item.action.state)).toEqual([
      "day_30",
      "day_20",
      "responded",
    ]);
    expect(items[1].action.daysSinceRequest).toBe(22);
  });

  it("shows the portal-first action, exact script, and escalation path", async () => {
    const user = userEvent.setup();
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.stage = "records";
    render(
      <CaseProvider initialCase={applicantCase}>
        <RecordsTracker />
      </CaseProvider>,
    );

    expect(screen.getByText("Deadline passed")).toBeInTheDocument();
    expect(
      screen.getByText(/check the patient portal first/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/office for civil rights complaint/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/almost 12 months old/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /mercy general hospital/i }),
    );
    expect(screen.getByText("Jul 18, 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /mark received/i }),
    ).toBeEnabled();
  });

  it("confirms a spoken received-state update before changing the tracker", async () => {
    const user = userEvent.setup();
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.stage = "records";
    voiceMocks.ask
      .mockResolvedValueOnce("mark received")
      .mockResolvedValueOnce("yes");

    render(
      <CaseProvider initialCase={applicantCase}>
        <VoiceActivator />
        <RecordsTracker />
      </CaseProvider>,
    );

    expect(screen.getByText("1 of 3 received")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Activate voice" }));

    expect(await screen.findByText("2 of 3 received")).toBeVisible();
    expect(voiceMocks.ask).toHaveBeenCalledWith(
      expect.stringContaining(
        "mark the records from Mercy General Hospital as received",
      ),
    );
    expect(voiceMocks.speak).toHaveBeenCalledWith(
      "Mercy General Hospital is marked received.",
    );
  });
});

function VoiceActivator() {
  const { setVoiceSessionActive } = useApplicantCase();
  return (
    <button onClick={() => setVoiceSessionActive(true)} type="button">
      Activate voice
    </button>
  );
}
