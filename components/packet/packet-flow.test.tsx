import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CaseProvider, useApplicantCase } from "@/components/app/case-context";
import { PacketFlow } from "@/components/packet/packet-flow";
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

describe("PacketFlow", () => {
  it("shows the exact packet and personalized checklist before generation", () => {
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.stage = "documents";
    applicantCase.conditions[1].allegedOnsetDate.provenance.state =
      "confirmed";
    render(
      <CaseProvider initialCase={applicantCase}>
        <PacketFlow />
      </CaseProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: /review and download your application documents/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("SSA-16").length).toBeGreaterThan(0);
    expect(screen.getAllByText("SSA-827").length).toBeGreaterThan(0);
    expect(screen.getByText("Evidence index")).toBeInTheDocument();
    expect(screen.getByText("Recent pay stubs or business-profit records"))
      .toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate packet/i }),
    ).toBeEnabled();
  });

  it("adds an extra blank authorization only after the applicant asks", async () => {
    const user = userEvent.setup();
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.stage = "documents";
    render(
      <CaseProvider initialCase={applicantCase}>
        <PacketFlow />
      </CaseProvider>,
    );

    expect(screen.getAllByText("SSA-827")).toHaveLength(1);
    await user.click(
      screen.getByRole("checkbox", {
        name: /include one extra blank SSA-827 original/i,
      }),
    );
    expect(screen.getAllByText("SSA-827")).toHaveLength(2);
  });

  it("generates and advances when an active voice session asks it to", async () => {
    const user = userEvent.setup();
    const applicantCase = structuredClone(syntheticApplicant);
    applicantCase.stage = "documents";
    voiceMocks.ask
      .mockResolvedValueOnce("yes")
      .mockResolvedValueOnce("no")
      .mockResolvedValueOnce("yes");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(new Blob(["packet"]), {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "x-packet-documents": "5",
            "x-packet-pages": "39",
          },
        }),
      ),
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:packet"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });

    render(
      <CaseProvider initialCase={applicantCase}>
        <VoiceActivator />
        <PacketFlow />
        <StageProbe />
      </CaseProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Activate voice" }));

    expect(await screen.findByText("Packet ready")).toBeVisible();
    expect(voiceMocks.speak).toHaveBeenCalledWith(
      "I am creating the forms, continuation sheets, and evidence index now.",
    );
    expect(voiceMocks.ask).toHaveBeenCalledWith(
      "Would you like me to create your application documents now?",
    );
    expect(voiceMocks.ask).toHaveBeenCalledWith(
      "Would you like to open the medical records tracker?",
    );
    expect(screen.getByTestId("case-stage")).toHaveTextContent("records");
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

function StageProbe() {
  const { applicantCase } = useApplicantCase();
  return <output data-testid="case-stage">{applicantCase.stage}</output>;
}
