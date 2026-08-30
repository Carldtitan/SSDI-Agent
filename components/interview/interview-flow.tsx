"use client";

import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleAlert,
  Keyboard,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useApplicantCase } from "@/components/app/case-context";
import { Button } from "@/components/ui/button";
import Orb from "@/components/visual/orb";
import { useVoiceTurn } from "@/components/voice/use-voice-turn";
import type { InterviewTurn } from "@/lib/case/types";
import { applyInterviewExtraction } from "@/lib/extraction/apply";
import type { InterviewExtraction } from "@/lib/extraction/schema";
import { parseYesNo } from "@/lib/voice/answer-parsers";
import { cn } from "@/lib/utils";

type InputMode = "voice" | "typed";
type InterviewStatus =
  | "intro"
  | "asking"
  | "extracting"
  | "confirming"
  | "ready"
  | "error";

interface InterviewTopic {
  id: string;
  label: string;
  prompt: string;
}

interface PendingTurn {
  extraction: InterviewExtraction;
  prompt: string;
  source: Exclude<InterviewTurn["source"], "demo">;
  topicIndex: number;
  transcript: string;
  turnId: string;
}

type FailedTurn = Omit<PendingTurn, "extraction">;

const topics: InterviewTopic[] = [
  {
    id: "legal_name",
    label: "Your name",
    prompt: "What is your full legal name?",
  },
  {
    id: "other_names",
    label: "Other names",
    prompt:
      "Have you used any other names on work, school, or medical records? Say no if you have not.",
  },
  {
    id: "identity",
    label: "Identity",
    prompt:
      "What is your Social Security number, date of birth, and place of birth? You may say one item at a time and pause between them.",
  },
  {
    id: "language_citizenship",
    label: "Language",
    prompt:
      "Are you a United States citizen, and what language do you prefer for this interview?",
  },
  {
    id: "address",
    label: "Address",
    prompt:
      "What is your full mailing address, including the city, state, and ZIP code?",
  },
  {
    id: "contact",
    label: "Contact",
    prompt:
      "What phone number and email address should Social Security use to reach you?",
  },
  {
    id: "claim_contact",
    label: "Backup contact",
    prompt:
      "Is there a family member, friend, or neighbor who knows about your conditions and can help Social Security reach you? If yes, tell me their name, relationship to you, phone number, address, and preferred language.",
  },
  {
    id: "conditions",
    label: "Health",
    prompt:
      "Tell me about one physical or mental condition that limits you: its name, when it began limiting work, the symptoms, and what it stops you from doing at work. You can include the next condition in the same answer.",
  },
  {
    id: "providers",
    label: "Care",
    prompt:
      "Tell me about one doctor, clinic, hospital, therapist, or other place that treated you. Include the name, location, phone number, what they treated, and first and most recent visit if you know them. If your list is finished, say there are no more providers.",
  },
  {
    id: "medical_tests",
    label: "Medical tests",
    prompt:
      "Have you had or been scheduled for medical tests such as an MRI, CT scan, X-ray, blood test, breathing test, heart test, hearing test, vision test, or psychological test? For each one, tell me the test, body part if relevant, facility, and date.",
  },
  {
    id: "medications",
    label: "Medicine",
    prompt:
      "Tell me every medicine you take. Include the dose, how often, who prescribed it, why you take it, and any side effects. Say none if you take no medicine.",
  },
  {
    id: "education",
    label: "Education",
    prompt:
      "What is the highest grade or college year you completed, when and where did you complete it, and were you in special education?",
  },
  {
    id: "training",
    label: "Training",
    prompt:
      "Have you completed any job training, trade school, or certification? Tell me what it was, where you trained, and the written language you use most.",
  },
  {
    id: "jobs",
    label: "Work",
    prompt:
      "Tell me about every job you had in the five years before your condition stopped or limited your work. For each job include dates, pay, hours, duties, lifting, standing, walking, sitting, tools, supervision, reports, and why it ended.",
  },
  {
    id: "marriages",
    label: "Marriage",
    prompt:
      "Have you ever been married? For each marriage, tell me your spouse's name, when it began, and when and how it ended if it ended.",
  },
  {
    id: "children",
    label: "Children",
    prompt:
      "Do you have any children? Tell me each child's name and date of birth. Include a Social Security number only if you know it.",
  },
  {
    id: "military",
    label: "Military",
    prompt:
      "Have you ever served in the United States military?",
  },
  {
    id: "recent_work",
    label: "Recent work",
    prompt:
      "Did you work at any time during the last year, and are you earning any money from work now?",
  },
  {
    id: "other_benefits",
    label: "Other benefits",
    prompt:
      "Have you filed, or do you intend to file, for another public disability benefit such as Veterans benefits, Supplemental Security Income, welfare, workers' compensation, or another public disability program? If yes, name each one.",
  },
  {
    id: "bank",
    label: "Direct deposit",
    prompt:
      "Would you like to add direct-deposit details to this packet now? If yes, say whether it is checking or savings, then say the routing number and account number. You can say not now and add them during review instead.",
  },
];

const factLabels: Partial<
  Record<InterviewExtraction["facts"][number]["field"], string>
> = {
  "applicant.legalName": "Legal name",
  "applicant.ssn": "Social Security number",
  "applicant.dateOfBirth": "Date of birth",
  "applicant.phone": "Phone",
  "applicant.email": "Email",
  "condition.name": "Condition",
  "condition.symptom": "Symptom",
  "condition.workEffect": "Work effect",
  "provider.name": "Provider",
  "provider.facility": "Facility",
  "provider.specialty": "Specialty",
  "medication.name": "Medication",
  "medication.dosage": "Dose",
  "medication.frequency": "Frequency",
  "education.highestLevel": "Education",
  "education.training": "Training",
  "job.employer": "Employer",
  "job.title": "Job",
  "job.duty": "Duty",
  "job.reasonEnded": "Why work ended",
  "marriage.spouseName": "Spouse",
  "child.name": "Child",
  "claimContact.name": "Backup contact",
  "claimContact.relationship": "Relationship",
  "claimContact.phone": "Contact phone",
  "medicalTest.type": "Medical test",
  "medicalTest.bodyPart": "Body part",
  "medicalTest.providerOrFacility": "Testing facility",
  "medicalTest.date": "Test date",
  otherPublicDisabilityBenefitTypes: "Other benefit",
  bankAccountType: "Account type",
  bankRoutingNumber: "Routing number",
  bankAccountNumber: "Account number",
};

export function InterviewFlow() {
  const {
    dispatch,
    setVoiceSessionActive,
    voiceSessionActive,
  } = useApplicantCase();
  const [mode, setMode] = useState<InputMode>("voice");
  const [status, setStatus] = useState<InterviewStatus>("intro");
  const [topicIndex, setTopicIndex] = useState(0);
  const [prompt, setPrompt] = useState(topics[0].prompt);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [pending, setPending] = useState<PendingTurn | null>(null);
  const [failedTurn, setFailedTurn] = useState<FailedTurn | null>(null);
  const [lastExtraction, setLastExtraction] =
    useState<InterviewExtraction | null>(null);
  const [capturedFacts, setCapturedFacts] = useState<
    InterviewExtraction["facts"]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const voice = useVoiceTurn();
  const autoStartedRef = useRef(false);

  useEffect(() => {
    if (!voiceSessionActive || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startVoiceInterview();
    // The voice session flag is intentionally the only automatic trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionActive]);

  async function startVoiceInterview() {
    autoStartedRef.current = true;
    setVoiceSessionActive(true);
    const runId = ++runIdRef.current;
    setMode("voice");
    setStatus("asking");
    setError(null);
    try {
      await voice.activate();
      await runVoiceTopic(0, topics[0].prompt, runId);
    } catch (startError) {
      if (runId !== runIdRef.current) return;
      setMode("typed");
      setStatus("error");
      setError(
        startError instanceof Error
          ? startError.message
          : "The microphone did not start. Your progress is safe.",
      );
    }
  }

  function startTypedInterview() {
    setVoiceSessionActive(false);
    ++runIdRef.current;
    setMode("typed");
    setStatus("asking");
    setTopicIndex(0);
    setPrompt(topics[0].prompt);
    setError(null);
  }

  async function runVoiceTopic(
    nextTopicIndex: number,
    nextPrompt: string,
    runId: number,
  ) {
    if (nextTopicIndex >= topics.length) {
      await completeVoiceInterview(runId);
      return;
    }
    setTopicIndex(nextTopicIndex);
    setPrompt(nextPrompt);
    setPending(null);
    setStatus("asking");
    setError(null);
    try {
      const transcript = await voice.ask(nextPrompt);
      if (runId !== runIdRef.current) return;
      const nextPending = await extractTurn(
        transcript,
        "voice",
        nextTopicIndex,
        nextPrompt,
      );
      if (!nextPending || runId !== runIdRef.current) return;
      await confirmVoiceTurn(nextPending, runId);
    } catch (turnError) {
      if (runId !== runIdRef.current) return;
      setStatus("error");
      setError(
        turnError instanceof Error
          ? turnError.message
          : "I could not complete that answer. Your transcript is still here.",
      );
    }
  }

  async function confirmVoiceTurn(nextPending: PendingTurn, runId: number) {
    setStatus("confirming");
    let clarification =
      `So I am going to put down: ${nextPending.extraction.summary} ` +
      "Is that right? Say yes to save it, or no to answer again.";
    for (;;) {
      const confirmation = await voice.ask(clarification);
      if (runId !== runIdRef.current) return;
      const parsed = parseYesNo(confirmation);
      if (!parsed.ok) {
        clarification = "Please say yes if that summary is right, or no to change it.";
        continue;
      }
      if (!parsed.value) {
        dispatch({
          type: "UPDATE_INTERVIEW_TURN",
          turnId: nextPending.turnId,
          patch: { status: "final" },
        });
        await voice.speak("Okay. I will not save those facts. Let us try again.");
        if (runId === runIdRef.current) {
          await runVoiceTopic(
            nextPending.topicIndex,
            nextPending.prompt,
            runId,
          );
        }
        return;
      }
      commitPending(nextPending);
      const next = nextStep(nextPending);
      if (next.topicIndex >= topics.length) {
        await completeVoiceInterview(runId);
      } else {
        await runVoiceTopic(next.topicIndex, next.prompt, runId);
      }
      return;
    }
  }

  async function extractTurn(
    rawTranscript: string,
    source: Exclude<InterviewTurn["source"], "demo">,
    currentTopicIndex: number,
    currentPrompt: string,
  ): Promise<PendingTurn | null> {
    const transcript = rawTranscript.trim();
    if (!transcript) {
      setStatus("error");
      setError("Add an answer before continuing.");
      return null;
    }
    const turnId = `turn-${crypto.randomUUID()}`;
    dispatch({
      type: "ADD_INTERVIEW_TURN",
      turn: {
        id: turnId,
        prompt: currentPrompt,
        transcript,
        source,
        status: "extracting",
        createdAt: new Date().toISOString(),
      },
    });
    setStatus("extracting");
    setError(null);
    setFailedTurn(null);
    try {
      const extraction = await requestExtraction(
        turnId,
        topics[currentTopicIndex].id,
        currentPrompt,
        transcript,
      );
      const nextPending = {
        extraction,
        prompt: currentPrompt,
        source,
        topicIndex: currentTopicIndex,
        transcript,
        turnId,
      } satisfies PendingTurn;
      setPending(nextPending);
      setFailedTurn(null);
      setLastExtraction(extraction);
      setStatus("confirming");
      return nextPending;
    } catch (extractionError) {
      dispatch({
        type: "UPDATE_INTERVIEW_TURN",
        turnId,
        patch: { status: "failed" },
      });
      const failed = {
        prompt: currentPrompt,
        source,
        topicIndex: currentTopicIndex,
        transcript,
        turnId,
      } satisfies FailedTurn;
      setFailedTurn(failed);
      setStatus("error");
      setError(
        extractionError instanceof Error
          ? extractionError.message
          : "Your transcript is safe, but fact extraction failed.",
      );
      if (source === "voice") {
        await offerSpokenExtractionRetry(failed);
      }
      return null;
    }
  }

  async function retryPreservedExtraction(
    failed: FailedTurn,
  ): Promise<PendingTurn | null> {
    setStatus("extracting");
    setError(null);
    dispatch({
      type: "UPDATE_INTERVIEW_TURN",
      turnId: failed.turnId,
      patch: { status: "extracting" },
    });
    try {
      const extraction = await requestExtraction(
        failed.turnId,
        topics[failed.topicIndex].id,
        failed.prompt,
        failed.transcript,
      );
      const nextPending = { ...failed, extraction } satisfies PendingTurn;
      setPending(nextPending);
      setFailedTurn(null);
      setLastExtraction(extraction);
      setStatus("confirming");
      dispatch({
        type: "UPDATE_INTERVIEW_TURN",
        turnId: failed.turnId,
        patch: { status: "extracting" },
      });
      return nextPending;
    } catch (retryError) {
      dispatch({
        type: "UPDATE_INTERVIEW_TURN",
        turnId: failed.turnId,
        patch: { status: "failed" },
      });
      setStatus("error");
      setError(
        retryError instanceof Error
          ? retryError.message
          : "The same answer could not be processed. It is still in the transcript.",
      );
      return null;
    }
  }

  async function offerSpokenExtractionRetry(failed: FailedTurn) {
    try {
      const answer = await voice.ask(
        "I kept your answer, but I could not turn it into form facts. Would you like me to try the same answer again?",
      );
      const parsed = parseYesNo(answer);
      if (!parsed.ok || !parsed.value) {
        await voice.speak(
          "Okay. Your answer is still in the transcript. You can retry it or use the keyboard control.",
        );
        return;
      }
      const nextPending = await retryPreservedExtraction(failed);
      if (nextPending) {
        await confirmVoiceTurn(nextPending, runIdRef.current);
      } else {
        await voice.speak(
          "That service is still unavailable. Your answer remains safe in the transcript.",
        );
      }
    } catch {
      // Visible retry and keyboard controls remain available.
    }
  }

  function commitPending(turn: PendingTurn) {
    applyInterviewExtraction(dispatch, turn.extraction, turn.turnId, {
      confirmed: true,
      source: turn.source === "typed" ? "typed" : "voice",
    });
    dispatch({
      type: "UPDATE_INTERVIEW_TURN",
      turnId: turn.turnId,
      patch: { status: "extracted" },
    });
    setCapturedFacts((facts) => [...facts, ...turn.extraction.facts]);
    setLastExtraction(turn.extraction);
    setPending(null);
    setTypedAnswer("");
  }

  function nextStep(turn: PendingTurn) {
    const topic = topics[turn.topicIndex];
    if (
      topic.id === "providers" &&
      turn.extraction.providerListStatus !== "complete"
    ) {
      return {
        topicIndex: turn.topicIndex,
        prompt:
          turn.extraction.followUpQuestion.trim() ||
          "Is there any other doctor, clinic, hospital, therapist, or place of care? Say no one else only when the list is complete.",
      };
    }
    const nextTopicIndex = turn.topicIndex + 1;
    return {
      topicIndex: nextTopicIndex,
      prompt: topics[nextTopicIndex]?.prompt ?? "",
    };
  }

  async function completeVoiceInterview(runId: number) {
    setStatus("ready");
    try {
      const answer = await voice.ask(
        "The interview is complete. Your answers are ready for one final review before they reach the forms. Would you like to review them now?",
      );
      if (runId !== runIdRef.current) return;
      const parsed = parseYesNo(answer);
      if (parsed.ok && parsed.value) {
        dispatch({ type: "SET_STAGE", stage: "review" });
      }
    } catch {
      // The visible review action remains available.
    }
  }

  function submitTypedAnswer(event: FormEvent) {
    event.preventDefault();
    void extractTurn(typedAnswer, "typed", topicIndex, prompt);
  }

  function confirmTypedTurn(confirmed: boolean) {
    if (!pending) return;
    if (!confirmed) {
      dispatch({
        type: "UPDATE_INTERVIEW_TURN",
        turnId: pending.turnId,
        patch: { status: "final" },
      });
      setPending(null);
      setTypedAnswer("");
      setStatus("asking");
      return;
    }
    commitPending(pending);
    const next = nextStep(pending);
    if (next.topicIndex >= topics.length) {
      setStatus("ready");
      return;
    }
    setTopicIndex(next.topicIndex);
    setPrompt(next.prompt);
    setStatus("asking");
  }

  const shownFacts = useMemo(
    () =>
      (pending?.extraction.facts ?? capturedFacts)
        .filter((fact) => factLabels[fact.field])
        .slice(-20),
    [capturedFacts, pending],
  );
  const progress =
    status === "ready"
      ? 100
      : Math.round(((topicIndex + (status === "confirming" ? 0.5 : 0)) / topics.length) * 100);

  return (
    <div className="mx-auto grid w-full max-w-[76rem] gap-8 xl:grid-cols-[minmax(0,1fr)_19rem] xl:gap-12">
      <section className="min-w-0 pb-20">
        {status === "intro" ? (
          <InterviewIntro
            onKeyboard={startTypedInterview}
            onStart={() => void startVoiceInterview()}
          />
        ) : (
          <>
            <header className="pt-3 sm:pt-7">
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm font-bold text-primary">
                  Interview · {status === "ready" ? "Complete" : topics[topicIndex].label}
                </p>
                <p className="text-sm font-bold text-muted">{progress}%</p>
              </div>
              <div
                aria-hidden="true"
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-subtle"
              >
                <motion.div
                  animate={{ width: `${progress}%` }}
                  className="h-full rounded-full bg-primary"
                />
              </div>
              <h1 className="mt-5 max-w-[19ch] text-4xl font-bold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
                {status === "ready"
                  ? "Your answers are ready to review."
                  : status === "confirming" && pending
                    ? `I heard: ${pending.extraction.summary}`
                    : prompt}
              </h1>
              {status !== "ready" ? (
                <p className="mt-4 max-w-[46rem] leading-relaxed text-muted">
                  {status === "confirming"
                    ? "Nothing is saved until you confirm this summary."
                    : "Answer naturally. The assistant will read back what it understood before saving any facts."}
                </p>
              ) : null}
            </header>

            {status !== "ready" ? (
              <div className="mt-7 overflow-hidden rounded-[var(--radius-surface)] border border-border bg-surface shadow-[0_20px_70px_oklch(0_0_0/0.055)]">
                {mode === "voice" ? (
                  <VoiceSurface
                    level={voice.level}
                    onFinish={voice.finishAnswer}
                    onPause={voice.pause}
                  onReplay={() =>
                      void voice.speak(
                        status === "confirming" && pending
                          ? `So I am going to put down: ${pending.extraction.summary}. Is that right?`
                          : prompt,
                      )
                    }
                    onResume={voice.resume}
                    state={voice.state}
                  />
                ) : (
                  <TypedSurface
                    answer={typedAnswer}
                    confirming={status === "confirming" && Boolean(pending)}
                    disabled={status === "extracting"}
                    onAnswer={setTypedAnswer}
                    onConfirm={confirmTypedTurn}
                    onSubmit={submitTypedAnswer}
                  />
                )}
              </div>
            ) : (
              <div className="mt-7 flex flex-col gap-4 rounded-[var(--radius-surface)] border border-success/20 bg-success-soft p-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex items-center gap-3 font-bold text-success">
                  <span className="grid size-9 place-items-center rounded-full bg-surface">
                    <Check aria-hidden="true" className="size-5" />
                  </span>
                  You completed every interview section.
                </p>
                <Button
                  onClick={() =>
                    dispatch({ type: "SET_STAGE", stage: "review" })
                  }
                >
                  Review captured facts
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </div>
            )}

            {error || voice.error ? (
              <div
                className="mt-4 flex flex-col gap-3 rounded-[var(--radius-control)] bg-danger-soft p-4 text-danger sm:flex-row sm:items-center sm:justify-between"
                role="alert"
              >
                <p className="flex items-center gap-2 text-sm font-bold">
                  <CircleAlert aria-hidden="true" className="size-4" />
                  {error || voice.error}
                </p>
                <div className="flex flex-wrap gap-2">
                  {failedTurn ? (
                    <Button
                      onClick={() => {
                        void retryPreservedExtraction(failedTurn).then(
                          (nextPending) => {
                            if (
                              nextPending &&
                              failedTurn.source === "voice"
                            ) {
                              void confirmVoiceTurn(
                                nextPending,
                                runIdRef.current,
                              );
                            }
                          },
                        );
                      }}
                      size="small"
                      variant="secondary"
                    >
                      <RotateCcw aria-hidden="true" className="size-4" />
                      Retry this answer
                    </Button>
                  ) : null}
                  <Button
                    onClick={() => {
                      setMode("typed");
                      setStatus("asking");
                      setError(null);
                    }}
                    size="small"
                    variant="secondary"
                  >
                    <Keyboard aria-hidden="true" className="size-4" />
                    Continue by keyboard
                  </Button>
                </div>
              </div>
            ) : null}

            <TranscriptDisclosure />
          </>
        )}
      </section>

      <FactsPanel
        extraction={lastExtraction}
        facts={shownFacts}
        pending={Boolean(pending)}
        status={status}
      />
    </div>
  );
}

function InterviewIntro({
  onKeyboard,
  onStart,
}: {
  onKeyboard: () => void;
  onStart: () => void;
}) {
  return (
    <div className="pt-[clamp(1rem,6vh,5rem)]">
      <p className="text-sm font-bold text-primary">Hands-free interview</p>
      <h1 className="mt-4 max-w-[13ch] text-[clamp(2.65rem,7vw,5.3rem)] font-bold leading-[0.96] tracking-[-0.055em]">
        Tell your story. We will build the forms.
      </h1>
      <p className="mt-6 max-w-[42rem] text-lg leading-relaxed text-muted sm:text-xl">
        After one click, questions, listening, readbacks, and section changes
        happen aloud. You can pause or correct anything.
      </p>
      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Button className="sm:min-w-52" onClick={onStart}>
          <Mic aria-hidden="true" className="size-4" />
          Start voice interview
        </Button>
      </div>
      <Button
        className="-ml-3 mt-4"
        onClick={onKeyboard}
        size="small"
        variant="quiet"
      >
        <Keyboard aria-hidden="true" className="size-4" />
        Use one-question keyboard fallback
      </Button>
    </div>
  );
}

function VoiceSurface({
  level,
  onFinish,
  onPause,
  onReplay,
  onResume,
  state,
}: {
  level: number;
  onFinish: () => void;
  onPause: () => void;
  onReplay: () => void;
  onResume: () => void;
  state: ReturnType<typeof useVoiceTurn>["state"];
}) {
  const status = {
    idle: "Preparing the next turn",
    requesting: "Waiting for microphone permission",
    speaking: "Speaking",
    listening: "Listening",
    paused: "Paused - your answer is still here",
    processing: "Turning your answer into text",
    error: "Needs your attention",
  }[state];
  return (
    <div className="grid min-h-[25rem] place-items-center bg-surface-subtle/60 p-5 text-center">
      <div>
        <div
          className="relative mx-auto size-52 sm:size-64"
          style={{
            transform: `scale(${1 + level * 0.08})`,
            transition: "transform 100ms linear",
          }}
        >
          <Orb
            backgroundColor="#000000"
            forceHoverState={["speaking", "listening", "processing"].includes(
              state,
            )}
            hoverIntensity={state === "listening" ? 0.65 : 0.28}
            hue={state === "listening" ? 330 : state === "processing" ? 205 : 15}
            rotateOnHover
          />
        </div>
        <p aria-live="polite" className="mt-3 flex items-center justify-center gap-2 font-bold">
          <span
            className={cn(
              "size-2 rounded-full bg-muted",
              state === "listening" && "animate-pulse bg-primary",
              state === "speaking" && "bg-accent",
            )}
          />
          {status}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {state === "listening" ? (
            <>
              <Button onClick={onPause} size="small" variant="secondary">
                <Pause aria-hidden="true" className="size-4" />
                Pause
              </Button>
              <Button onClick={onFinish} size="small">
                <Square aria-hidden="true" className="size-4" />
                I&apos;m done
              </Button>
            </>
          ) : null}
          {state === "paused" ? (
            <>
              <Button onClick={onResume} size="small">
                <Play aria-hidden="true" className="size-4" />
                Resume
              </Button>
              <Button onClick={onFinish} size="small" variant="secondary">
                <Square aria-hidden="true" className="size-4" />
                I&apos;m done
              </Button>
            </>
          ) : null}
          <Button onClick={onReplay} size="small" variant="quiet">
            <Volume2 aria-hidden="true" className="size-4" />
            Replay
          </Button>
        </div>
      </div>
    </div>
  );
}

function TypedSurface({
  answer,
  confirming,
  disabled,
  onAnswer,
  onConfirm,
  onSubmit,
}: {
  answer: string;
  confirming: boolean;
  disabled: boolean;
  onAnswer: (answer: string) => void;
  onConfirm: (confirmed: boolean) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  return (
    <form className="p-5 sm:p-6" onSubmit={onSubmit}>
      {confirming ? (
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={() => onConfirm(true)}>
            <Check aria-hidden="true" className="size-4" />
            Yes, save these facts
          </Button>
          <Button onClick={() => onConfirm(false)} variant="secondary">
            No, answer again
          </Button>
        </div>
      ) : (
        <>
          <label className="sr-only" htmlFor="typed-interview-answer">
            Answer the current question
          </label>
          <textarea
            autoFocus
            className="min-h-52 w-full resize-y rounded-[var(--radius-control)] border border-border bg-background p-4 text-lg leading-relaxed placeholder:text-muted/65 focus:border-focus"
            disabled={disabled}
            id="typed-interview-answer"
            onChange={(event) => onAnswer(event.currentTarget.value)}
            placeholder="Answer in your own words"
            value={answer}
          />
          <Button className="mt-4" disabled={disabled} type="submit">
            {disabled ? "Finding facts" : "Review what I said"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </>
      )}
    </form>
  );
}

function TranscriptDisclosure() {
  const { applicantCase } = useApplicantCase();
  if (!applicantCase.interviewTurns.length) return null;
  return (
    <details className="group mt-5 rounded-[var(--radius-control)] border border-border bg-surface">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 font-bold">
        Transcript
        <ChevronDown
          aria-hidden="true"
          className="size-4 transition-transform group-open:rotate-180"
        />
      </summary>
      <ol className="grid gap-4 border-t border-border px-4 py-4">
        {applicantCase.interviewTurns.map((turn) => (
          <li className="leading-relaxed" key={turn.id}>
            <p className="text-xs font-bold text-primary">{turn.prompt}</p>
            <p className="mt-1 text-muted">{turn.transcript}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}

function FactsPanel({
  extraction,
  facts,
  pending,
  status,
}: {
  extraction: InterviewExtraction | null;
  facts: InterviewExtraction["facts"];
  pending: boolean;
  status: InterviewStatus;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <h2 className="font-bold">{pending ? "Waiting for you" : "Captured facts"}</h2>
        <span className="text-xs font-bold text-muted">{facts.length || "—"}</span>
      </div>
      {status === "extracting" ? (
        <div className="mt-5 grid gap-2" aria-label="Extracting facts">
          {[0, 1, 2, 3].map((item) => (
            <motion.div
              animate={{ opacity: [0.35, 0.8, 0.35] }}
              className="h-14 rounded-[var(--radius-control)] bg-surface-subtle"
              key={item}
              transition={{ duration: 1.2, delay: item * 0.08, repeat: Infinity }}
            />
          ))}
        </div>
      ) : null}
      {status !== "extracting" && !facts.length ? (
        <p className="mt-4 text-sm leading-relaxed text-muted">
          Facts appear here after an answer. No fact enters the case before a
          spoken or typed confirmation.
        </p>
      ) : null}
      <AnimatePresence>
        {facts.length ? (
          <motion.ul className="mt-4 grid gap-2">
            {facts.map((fact, index) => (
              <motion.li
                animate={{ opacity: 1, x: 0 }}
                className="rounded-[var(--radius-control)] border border-border bg-surface px-3.5 py-3"
                initial={{ opacity: 0, x: 12 }}
                key={`${fact.entityKey}-${fact.field}-${index}`}
              >
                <p className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">
                  {factLabels[fact.field]}
                </p>
                <p className="mt-1 font-bold leading-snug">{fact.value}</p>
              </motion.li>
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
      {extraction?.providerListStatus === "complete" ? (
        <p className="mt-4 flex items-center gap-2 text-sm font-bold text-success">
          <Check aria-hidden="true" className="size-4" />
          Provider list marked complete
        </p>
      ) : null}
      {pending ? (
        <p className="mt-4 rounded-[var(--radius-control)] bg-accent-soft p-3 text-sm font-bold text-accent">
          These are not saved yet.
        </p>
      ) : null}
    </>
  );
  return (
    <>
      <aside
        aria-label="Facts captured from this answer"
        className="hidden min-w-0 xl:sticky xl:top-20 xl:block xl:h-[calc(100dvh-6rem)] xl:overflow-y-auto xl:border-l xl:border-border xl:pl-7 xl:pt-3"
      >
        {content}
      </aside>
      <details className="group mb-28 rounded-[var(--radius-control)] border border-border bg-surface xl:hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-bold">
          Captured facts
          <ChevronDown
            aria-hidden="true"
            className="size-4 transition-transform group-open:rotate-180"
          />
        </summary>
        <div className="border-t border-border p-4">{content}</div>
      </details>
    </>
  );
}

async function requestExtraction(
  turnId: string,
  topic: string,
  prompt: string,
  transcript: string,
): Promise<InterviewExtraction> {
  const response = await fetch("/api/interview/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ turnId, topic, prompt, transcript }),
  });
  const body = (await response.json()) as {
    extraction?: InterviewExtraction;
    error?: string;
  };
  if (!response.ok || !body.extraction) {
    throw new Error(
      body.error ||
        "Your transcript is safe, but fact extraction failed. Retry or review it manually.",
    );
  }
  return body.extraction;
}
