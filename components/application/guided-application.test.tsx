import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuidedApplication } from "@/components/application/guided-application";
import {
  CaseProvider,
  useApplicantCase,
} from "@/components/app/case-context";
import { syntheticApplicant } from "@/lib/case/seed";

vi.mock("@/components/visual/orb", () => ({
  default: () => <div data-testid="voice-orb" />,
}));

const voiceMocks = vi.hoisted(() => ({
  activate: vi.fn(),
  cancel: vi.fn(),
  listen: vi.fn(),
  skipSpeech: vi.fn(),
  speak: vi.fn(),
  state: "idle",
}));

const extractionMocks = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("@/components/voice/use-voice-turn", () => ({
  useVoiceTurn: () => ({
    ...voiceMocks,
    ask: vi.fn(),
    error: null,
    finishAnswer: vi.fn(),
    lastTranscript: "",
    level: 0,
    pause: vi.fn(),
    resume: vi.fn(),
    state: voiceMocks.state,
  }),
}));

vi.mock("@/lib/extraction/client", () => ({
  requestInterviewExtraction: extractionMocks.request,
}));

beforeEach(() => {
  voiceMocks.activate.mockReset().mockResolvedValue(undefined);
  voiceMocks.cancel.mockReset();
  voiceMocks.skipSpeech.mockReset();
  voiceMocks.speak.mockReset().mockResolvedValue(undefined);
  voiceMocks.state = "idle";
  voiceMocks.listen
    .mockReset()
    .mockImplementation(() => new Promise(() => undefined));
  extractionMocks.request
    .mockReset()
    .mockImplementation(
      async ({ transcript }: { transcript: string }) => ({
        summary: transcript,
        confirmationText: `I heard ${transcript}. Is that correct?`,
        followUpQuestion: "",
        providerListStatus: "unknown",
        facts: [
          {
            kind: "scalar",
            entityKey: "",
            field: "applicant.legalName",
            value: transcript,
            confidence: 0.99,
            evidenceText: transcript,
          },
        ],
      }),
    );
});

describe("GuidedApplication", () => {
  it("asks for language before any application question", () => {
    render(
      <CaseProvider>
        <GuidedApplication />
      </CaseProvider>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Which language would you like to use?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Prepare your SSDI application and organize the supporting records through a guided conversation.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual([
      expect.stringContaining("English"),
      expect.stringContaining("Español"),
      expect.stringContaining("中文（普通话）"),
    ]);
    expect(screen.queryByText("Check")).not.toBeInTheDocument();
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("does not render the removed AI-style copy", () => {
    render(
      <CaseProvider>
        <GuidedApplication />
      </CaseProvider>,
    );

    [
      "Voice-first application",
      "Your voice can complete this application",
      "Start voice check",
      "Start voice interview",
      "Use one-question keyboard fallback",
      "Nothing is saved when this tab closes",
    ].forEach((phrase) => {
      expect(screen.queryByText(phrase)).not.toBeInTheDocument();
    });
  });

  it("speaks the preparation introduction in the selected language", async () => {
    const user = userEvent.setup();
    render(
      <CaseProvider>
        <GuidedApplication />
      </CaseProvider>,
    );

    await user.click(screen.getByRole("button", { name: /EspañolES/i }));

    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        expect.stringContaining(
          "Le ayudaré a preparar su solicitud por discapacidad",
        ),
      ),
    );
    expect(
      screen.getByRole("combobox", { name: "Conversation language" }),
    ).toHaveValue("es-US");
  });

  it("lets the applicant skip pending audio and answer immediately", async () => {
    const user = userEvent.setup();
    const inProgressCase = structuredClone(syntheticApplicant);
    inProgressCase.mode = "session";
    inProgressCase.applicationPhase = "intake";
    inProgressCase.activeQuestionId = "legal-name";
    inProgressCase.finalReviewApproved = false;
    voiceMocks.state = "speaking";

    render(
      <CaseProvider initialCase={inProgressCase}>
        <GuidedApplication />
      </CaseProvider>,
    );

    const skipButton = screen.getByRole("button", {
      name: "Skip audio and answer now",
    });
    expect(skipButton).toHaveTextContent("Skip");

    await user.click(skipButton);

    expect(voiceMocks.skipSpeech).toHaveBeenCalledOnce();
  });

  it("returns to listening when transcription misses an answer", async () => {
    const user = userEvent.setup();
    voiceMocks.listen
      .mockReset()
      .mockRejectedValueOnce(new Error("No clear transcript"))
      .mockResolvedValueOnce("I'm ready")
      .mockImplementation(() => new Promise(() => undefined));

    render(
      <CaseProvider>
        <GuidedApplication />
      </CaseProvider>,
    );

    await user.click(screen.getByRole("button", { name: /EnglishEN/i }));

    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        "I didn’t catch that. I’m still listening.",
      ),
    );
    expect(
      await screen.findByRole("heading", {
        name: "What is your full legal name?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/The microphone is unavailable/i),
    ).not.toBeInTheDocument();
  });

  it("turns a rejected answer into a correction conversation", async () => {
    const user = userEvent.setup();
    voiceMocks.listen
      .mockReset()
      .mockResolvedValueOnce("I'm ready")
      .mockResolvedValueOnce("Alice Rivera")
      .mockResolvedValueOnce("No, don't save that")
      .mockResolvedValueOnce("Jane Rivera")
      .mockResolvedValueOnce("yes")
      .mockImplementation(() => new Promise(() => undefined));

    render(
      <CaseProvider>
        <GuidedApplication />
      </CaseProvider>,
    );

    await user.click(screen.getByRole("button", { name: /EnglishEN/i }));

    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        "Thanks for catching that. I won’t save it. What should I put down instead?",
      ),
    );
    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        expect.stringContaining(
          "I heard your full legal name as Jane Rivera. Is that exactly right?",
        ),
      ),
    );
    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        expect.stringContaining(
          "Thank you, I have that. What is your Social Security number?",
        ),
      ),
    );

    const originalQuestionCalls = voiceMocks.speak.mock.calls.filter(
      ([message]) => message === "What is your full legal name?",
    );
    expect(originalQuestionCalls).toHaveLength(1);
    expect(extractionMocks.request).toHaveBeenCalledTimes(2);
    expect(extractionMocks.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ transcript: "Jane Rivera" }),
    );
  });

  it("uses several facts from one answer without asking for them again", async () => {
    const user = userEvent.setup();
    voiceMocks.listen
      .mockReset()
      .mockResolvedValueOnce("I'm ready")
      .mockResolvedValueOnce(
        "I'm Jane Rivera, my SSN is REDACTED, and I was born January 2, 1980 in Fresno, California.",
      )
      .mockResolvedValueOnce("yes")
      .mockResolvedValueOnce("pause")
      .mockImplementation(() => new Promise(() => undefined));
    extractionMocks.request.mockResolvedValueOnce({
      summary:
        "Jane Rivera, SSN REDACTED, born January 2, 1980 in Fresno, California",
      acknowledgement: "I have those identity details.",
      answerComplete: true,
      confirmationText: "",
      followUpQuestion: "",
      providerListStatus: "unknown",
      facts: [
        {
          kind: "scalar",
          entityKey: "",
          field: "applicant.legalName",
          value: "Jane Rivera",
          confidence: 0.99,
          evidenceText: "Jane Rivera",
        },
        {
          kind: "scalar",
          entityKey: "",
          field: "applicant.ssn",
          value: "REDACTED",
          confidence: 0.99,
          evidenceText: "REDACTED",
        },
        {
          kind: "scalar",
          entityKey: "",
          field: "applicant.dateOfBirth",
          value: "1980-01-02",
          confidence: 0.99,
          evidenceText: "January 2, 1980",
        },
        {
          kind: "scalar",
          entityKey: "",
          field: "applicant.placeOfBirth",
          value: "Fresno, California",
          confidence: 0.99,
          evidenceText: "Fresno, California",
        },
      ],
    });

    render(
      <CaseProvider>
        <GuidedApplication />
      </CaseProvider>,
    );

    await user.click(screen.getByRole("button", { name: /EnglishEN/i }));

    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        expect.stringContaining(
          "I heard: Jane Rivera, SSN REDACTED, born January 2, 1980 in Fresno, California. Is that correct?",
        ),
      ),
    );
    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        expect.stringContaining(
          "Thank you, I have that. Are you a United States citizen?",
        ),
      ),
    );
    expect(
      voiceMocks.speak.mock.calls.some(
        ([message]) =>
          message ===
            "What is your Social Security number? You can say each digit separately." ||
          message === "What is your date of birth?" ||
          message ===
            "In what city, state, and country were you born?",
      ),
    ).toBe(false);
  });

  it("does not save a spoken name until the applicant confirms the readback", async () => {
    const user = userEvent.setup();
    let confirmAnswer: ((value: string) => void) | undefined;
    voiceMocks.listen
      .mockReset()
      .mockResolvedValueOnce("I'm ready")
      .mockResolvedValueOnce("Alyssa Rivers")
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            confirmAnswer = resolve;
          }),
      )
      .mockImplementation(() => new Promise(() => undefined));

    render(
      <CaseProvider>
        <GuidedApplication />
        <CaseProbe />
      </CaseProvider>,
    );

    await user.click(screen.getByRole("button", { name: /EnglishEN/i }));

    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        "I heard your full legal name as Alyssa Rivers. Is that exactly right?",
      ),
    );
    expect(screen.getByTestId("legal-name")).toBeEmptyDOMElement();

    confirmAnswer?.("yes");

    await waitFor(() =>
      expect(screen.getByTestId("legal-name")).toHaveTextContent(
        "Alyssa Rivers",
      ),
    );
  });

  it("speaks a short acknowledgement while extraction is still running", async () => {
    const user = userEvent.setup();
    let finishExtraction:
      | ((value: Awaited<ReturnType<typeof extractionMocks.request>>) => void)
      | undefined;
    voiceMocks.listen
      .mockReset()
      .mockResolvedValueOnce("I'm ready")
      .mockResolvedValueOnce("Alyssa Rivers")
      .mockImplementation(() => new Promise(() => undefined));
    extractionMocks.request.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishExtraction = resolve;
        }),
    );

    render(
      <CaseProvider>
        <GuidedApplication />
      </CaseProvider>,
    );

    await user.click(screen.getByRole("button", { name: /EnglishEN/i }));

    await waitFor(
      () =>
        expect(voiceMocks.speak).toHaveBeenCalledWith(
          "Okay, one moment.",
        ),
      { timeout: 1_500 },
    );

    finishExtraction?.({
      summary: "Alyssa Rivers",
      confirmationText: "I heard Alyssa Rivers. Is that correct?",
      followUpQuestion: "",
      providerListStatus: "unknown",
      facts: [
        {
          kind: "scalar",
          entityKey: "",
          field: "applicant.legalName",
          value: "Alyssa Rivers",
          confidence: 0.99,
          evidenceText: "Alyssa Rivers",
        },
      ],
    });

    await waitFor(() =>
      expect(voiceMocks.speak).toHaveBeenCalledWith(
        "I heard your full legal name as Alyssa Rivers. Is that exactly right?",
      ),
    );
  });

  it("loads Elena's sample answers without faking computer-use results", async () => {
    const user = userEvent.setup();
    const inProgressCase = structuredClone(syntheticApplicant);
    inProgressCase.mode = "session";
    inProgressCase.applicationPhase = "intake";
    inProgressCase.activeQuestionId = "ssn";
    inProgressCase.finalReviewApproved = false;
    inProgressCase.applicant.legalName.value = "Original Applicant";
    render(
      <CaseProvider initialCase={inProgressCase}>
        <GuidedApplication />
        <CaseProbe />
      </CaseProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: "Fill demo application" }),
    );
    expect(
      screen.getByRole("dialog", {
        name: "Replace these answers with Elena Rivera’s sample?",
      }),
    ).toBeVisible();
    expect(screen.getByText(/real Windows files/i)).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Load Elena sample" }),
    );

    expect(
      screen.getByRole("heading", {
        name: "Elena Rivera’s sample application is ready.",
      }),
    ).toBeVisible();
    expect(screen.getByTestId("case-mode")).toHaveTextContent("synthetic_demo");

    await user.click(
      screen.getByRole("button", { name: "Continue to documents" }),
    );
    expect(screen.getByTestId("case-stage")).toHaveTextContent("documents");
  });
});

function CaseProbe() {
  const { applicantCase } = useApplicantCase();
  return (
    <div hidden>
      <span data-testid="case-mode">{applicantCase.mode}</span>
      <span data-testid="case-stage">{applicantCase.stage}</span>
      <span data-testid="turn-count">{applicantCase.interviewTurns.length}</span>
      <span data-testid="legal-name">
        {applicantCase.applicant.legalName.value}
      </span>
    </div>
  );
}
