import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaseProvider, useApplicantCase } from "@/components/app/case-context";
import { ReviewFlow } from "@/components/review/review-flow";
import { syntheticApplicant } from "@/lib/case/seed";

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

describe("ReviewFlow", () => {
  it("requires confirmation before packet generation", async () => {
    const user = userEvent.setup();
    const reviewCase = structuredClone(syntheticApplicant);
    reviewCase.stage = "review";
    reviewCase.conditions[1].allegedOnsetDate.provenance.state = "unconfirmed";

    render(
      <CaseProvider initialCase={reviewCase}>
        <ReviewFlow />
        <StageProbe />
      </CaseProvider>,
    );

    const buildButton = screen.getByRole("button", {
      name: "Build my packet",
    });
    expect(buildButton).toBeDisabled();
    expect(screen.getByText("1 detail needs you")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(buildButton).toBeEnabled();
    expect(screen.getByText("Ready to build")).toBeInTheDocument();

    await user.click(buildButton);
    expect(screen.getByTestId("case-stage")).toHaveTextContent("packet");
  });

  it("surfaces possible duplicate providers without merging them", async () => {
    const user = userEvent.setup();
    const reviewCase = structuredClone(syntheticApplicant);
    reviewCase.stage = "review";
    reviewCase.providers.push({
      ...structuredClone(reviewCase.providers[0]),
      id: "possible-duplicate-provider",
    });

    render(
      <CaseProvider initialCase={reviewCase}>
        <ReviewFlow />
      </CaseProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Providers/ }));

    expect(screen.getAllByText(/Possible duplicate/)).toHaveLength(2);
    expect(
      screen.getAllByRole("button", {
        name: `Remove ${reviewCase.providers[0].name.value}`,
      }),
    ).toHaveLength(2);
  });

  it("continues a clear voice session into packet building", async () => {
    const user = userEvent.setup();
    voiceMocks.ask.mockResolvedValueOnce("yes");
    const reviewCase = structuredClone(syntheticApplicant);
    reviewCase.stage = "review";
    reviewCase.conditions[1].allegedOnsetDate.provenance.state = "confirmed";

    render(
      <CaseProvider initialCase={reviewCase}>
        <VoiceActivator />
        <ReviewFlow />
        <StageProbe />
      </CaseProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Activate voice" }));

    expect(await screen.findByText(/review is clear/i)).toBeVisible();
    expect(voiceMocks.ask).toHaveBeenCalledWith(
      "Your confirmed answers have no unresolved conflicts, and the provider list is complete. Should I build your filing packet now?",
    );
    expect(screen.getByTestId("case-stage")).toHaveTextContent("packet");
  });
});

function StageProbe() {
  const { applicantCase } = useApplicantCase();
  return <output data-testid="case-stage">{applicantCase.stage}</output>;
}

function VoiceActivator() {
  const { setVoiceSessionActive } = useApplicantCase();
  return (
    <button onClick={() => setVoiceSessionActive(true)} type="button">
      Activate voice
    </button>
  );
}
