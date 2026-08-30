"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  Info,
  Keyboard,
  LockKeyhole,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
  Volume2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FormEvent, useMemo, useRef, useState } from "react";

import { useApplicantCase } from "@/components/app/case-context";
import { Button } from "@/components/ui/button";
import { inputClassName } from "@/components/ui/form-controls";
import Orb from "@/components/visual/orb";
import { useVoiceTurn } from "@/components/voice/use-voice-turn";
import type { EligibilityInput } from "@/lib/case/types";
import { SSA_RULES_2026 } from "@/lib/rules/config";
import {
  evaluatePrequalification,
  type PrequalificationResult,
} from "@/lib/rules/prequalification";
import type { DecisionStatus, RuleResult } from "@/lib/rules/types";
import {
  parseCreditCount,
  parseDateAnswer,
  parseMoney,
  parseWorkYears,
  parseYesNo,
  type ParsedAnswer,
} from "@/lib/voice/answer-parsers";
import { cn } from "@/lib/utils";

type CheckScreen = "start" | "conversation" | "result";
type ConversationPhase = "asking" | "confirming" | "error";

interface VoiceQuestion {
  key: keyof EligibilityInput;
  prompt: string;
  confirmation: (spoken: string) => string;
  parse: (transcript: string) => ParsedAnswer<unknown>;
  skip?: (answers: EligibilityInput) => boolean;
  companionPatch?: (value: unknown) => Partial<EligibilityInput>;
}

const questions: VoiceQuestion[] = [
  {
    key: "monthlyEarningsUsd",
    prompt:
      "About how much are you earning from work in an average month before taxes? Say zero if you are not working.",
    parse: parseMoney,
    confirmation: (value) =>
      `I heard average work earnings of ${value} a month. I am going to put that down. Is that right?`,
  },
  {
    key: "statutorilyBlind",
    prompt:
      "Has a medical professional told you that you meet Social Security's definition of statutory blindness?",
    parse: parseYesNo,
    confirmation: (value) =>
      `So I am going to put statutory blindness down as ${value}. Is that right?`,
  },
  {
    key: "impairmentRelatedWorkExpensesUsd",
    prompt:
      "About how much do you pay each month for disability-related items or services you need in order to work? Say zero if none.",
    parse: parseMoney,
    confirmation: (value) =>
      `I heard ${value} a month in disability-related work expenses. Is that right?`,
  },
  {
    key: "employerSubsidyPossible",
    prompt:
      "Does an employer give you extra help, reduced duties, extra breaks, or other special work conditions because of your disability?",
    parse: parseYesNo,
    confirmation: (value) =>
      `I am going to put employer help or special conditions down as ${value}. Is that right?`,
  },
  {
    key: "selfEmployed",
    prompt: "Are you self-employed?",
    parse: parseYesNo,
    confirmation: (value) =>
      `I am going to put self-employment down as ${value}. Is that right?`,
    companionPatch: (value) =>
      value === false ? { selfEmploymentProfitUsd: null } : {},
  },
  {
    key: "selfEmploymentProfitUsd",
    prompt:
      "What is your average monthly business profit after ordinary business expenses?",
    parse: parseMoney,
    confirmation: (value) =>
      `I heard average monthly business profit of ${value}. Is that right?`,
    skip: (answers) => answers.selfEmployed !== true,
  },
  {
    key: "passiveIncomeIncluded",
    prompt:
      "Did the work-earnings amount include money that was not from your own work, such as interest or gifts?",
    parse: parseYesNo,
    confirmation: (value) =>
      `I am going to put non-work income included as ${value}. Is that right?`,
  },
  {
    key: "conditionExpectedToLast12Months",
    prompt:
      "Has your condition lasted, or is it expected to last, at least twelve continuous months?",
    parse: parseYesNo,
    confirmation: (value) =>
      `I am going to put the twelve-month duration answer down as ${value}. Is that right?`,
    companionPatch: (value) =>
      value === true ? { conditionExpectedToResultInDeath: false } : {},
  },
  {
    key: "conditionExpectedToResultInDeath",
    prompt: "Is the condition expected to result in death?",
    parse: parseYesNo,
    confirmation: (value) =>
      `I am going to put expected to result in death down as ${value}. Is that right?`,
    skip: (answers) => answers.conditionExpectedToLast12Months === true,
  },
  {
    key: "dateOfBirth",
    prompt: "What is your date of birth? Please say the month, day, and year.",
    parse: parseDateAnswer,
    confirmation: (value) =>
      `I heard your date of birth as ${value}. Is that right?`,
  },
  {
    key: "allegedOnsetDate",
    prompt:
      "When did your health condition become severe enough to limit or stop your work? Please say the month, day, and year.",
    parse: parseDateAnswer,
    confirmation: (value) =>
      `I heard the date your condition began limiting work as ${value}. Is that right?`,
  },
  {
    key: "estimatedLifetimeCredits",
    prompt:
      "If you know it, how many total Social Security work credits do you have? You can say I don't know.",
    parse: (value) => parseCreditCount(value, 40),
    confirmation: (value) =>
      `I am going to put your lifetime work-credit estimate down as ${value}. Is that right?`,
  },
  {
    key: "creditsLast3Years",
    prompt:
      "If you know it, how many work credits did you earn in the three years before your condition began limiting work?",
    parse: (value) => parseCreditCount(value, 12),
    confirmation: (value) =>
      `I am going to put your three-year credit estimate down as ${value}. Is that right?`,
    skip: (answers) => {
      const age = ageAtOnset(answers);
      return age === null || age >= 24;
    },
  },
  {
    key: "workedYearsAfter21BeforeOnset",
    prompt:
      "About how many years did you work after age twenty-one and before your condition began limiting work? You can say I don't know.",
    parse: parseWorkYears,
    confirmation: (value) =>
      `I am going to put your work-after-age-twenty-one estimate down as ${value}. Is that right?`,
    skip: (answers) => {
      const age = ageAtOnset(answers);
      return age === null || age < 24 || age > 30;
    },
  },
  {
    key: "creditsLast10Years",
    prompt:
      "If you know it, how many work credits did you earn in the ten years before your condition began limiting work?",
    parse: (value) => parseCreditCount(value, 40),
    confirmation: (value) =>
      `I am going to put your recent work-credit estimate down as ${value}. Is that right?`,
    skip: (answers) => {
      const age = ageAtOnset(answers);
      return age === null || age <= 30;
    },
  },
];

const resultLanguage: Record<
  DecisionStatus,
  { eyebrow: string; heading: string; detail: string }
> = {
  looks_clear: {
    eyebrow: "Ready to continue",
    heading: "No obvious screening issue",
    detail:
      "Your answers look consistent with the limited non-medical checks this assistant can estimate.",
  },
  needs_review: {
    eyebrow: "Worth checking first",
    heading: "One detail needs a closer look",
    detail:
      "You can keep preparing and applying. Confirm the highlighted detail before relying on this estimate.",
  },
  uncertain: {
    eyebrow: "One useful next step",
    heading: "Your Social Security record can answer this",
    detail:
      "Self-reported work credits are only an estimate. Your Social Security record is the source to verify.",
  },
};

export function CheckFlow() {
  const { applicantCase, dispatch, setVoiceSessionActive } =
    useApplicantCase();
  const [screen, setScreen] = useState<CheckScreen>(
    applicantCase.eligibilityInput.monthlyEarningsUsd !== null
      ? "result"
      : "start",
  );
  const [phase, setPhase] = useState<ConversationPhase>("asking");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [visiblePrompt, setVisiblePrompt] = useState(questions[0].prompt);
  const [lastAnswer, setLastAnswer] = useState("");
  const [pendingReadback, setPendingReadback] = useState("");
  const [typedAnswer, setTypedAnswer] = useState("");
  const [keyboardMode, setKeyboardMode] = useState(false);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [completedResult, setCompletedResult] =
    useState<PrequalificationResult | null>(null);
  const answersRef = useRef<EligibilityInput>(
    structuredClone(applicantCase.eligibilityInput),
  );
  const runIdRef = useRef(0);
  const voice = useVoiceTurn();

  const contextResult = useMemo(
    () =>
      evaluatePrequalification(applicantCase.eligibilityInput, SSA_RULES_2026),
    [applicantCase.eligibilityInput],
  );
  const result = completedResult ?? contextResult;

  async function startVoiceCheck() {
    setVoiceSessionActive(true);
    const runId = ++runIdRef.current;
    setScreen("conversation");
    setKeyboardMode(false);
    setFlowError(null);
    try {
      await voice.activate();
      await askQuestion(0, runId);
    } catch {
      if (runId !== runIdRef.current) return;
      setKeyboardMode(true);
      setPhase("error");
      setFlowError(
        "The microphone did not start. The same one-question flow is available by keyboard.",
      );
    }
  }

  function startKeyboardCheck() {
    setVoiceSessionActive(false);
    ++runIdRef.current;
    setScreen("conversation");
    setKeyboardMode(true);
    setQuestionIndex(0);
    setVisiblePrompt(questions[0].prompt);
    setFlowError(null);
  }

  async function askQuestion(index: number, runId: number) {
    const nextIndex = nextQuestionIndex(index, answersRef.current);
    if (nextIndex === -1) {
      await completeCheck(runId);
      return;
    }
    const question = questions[nextIndex];
    setQuestionIndex(nextIndex);
    setVisiblePrompt(question.prompt);
    setPendingReadback("");
    setPhase("asking");
    setFlowError(null);
    try {
      const transcript = await voice.ask(question.prompt);
      if (runId !== runIdRef.current) return;
      await processAnswer(question, transcript, nextIndex, runId, true);
    } catch (answerError) {
      if (runId !== runIdRef.current) return;
      setPhase("error");
      setFlowError(
        answerError instanceof Error
          ? answerError.message
          : "I could not hear that answer.",
      );
    }
  }

  async function processAnswer(
    question: VoiceQuestion,
    transcript: string,
    index: number,
    runId: number,
    spoken: boolean,
  ) {
    setLastAnswer(transcript);
    const parsed = question.parse(transcript);
    if (!parsed.ok) {
      setFlowError(parsed.reason);
      if (spoken) {
        await voice.speak(`${parsed.reason} I will ask again.`);
        if (runId === runIdRef.current) await askQuestion(index, runId);
      }
      return;
    }

    const readback = question.confirmation(parsed.spoken);
    setPendingReadback(readback);
    setPhase("confirming");
    setFlowError(null);
    if (!spoken) return;

    try {
      const confirmation = await voice.ask(readback);
      if (runId !== runIdRef.current) return;
      const confirmed = parseYesNo(confirmation);
      if (!confirmed.ok) {
        await voice.speak("Please say yes if that is right, or no to change it.");
        if (runId === runIdRef.current) {
          await processAnswer(question, transcript, index, runId, true);
        }
        return;
      }
      if (!confirmed.value) {
        await voice.speak("Okay. I will ask the question again.");
        if (runId === runIdRef.current) await askQuestion(index, runId);
        return;
      }
      commitAnswer(question, parsed.value);
      await askQuestion(index + 1, runId);
    } catch (confirmationError) {
      if (runId !== runIdRef.current) return;
      setPhase("error");
      setFlowError(
        confirmationError instanceof Error
          ? confirmationError.message
          : "I could not hear the confirmation.",
      );
    }
  }

  function commitAnswer(question: VoiceQuestion, value: unknown) {
    const patch = {
      [question.key]: value,
      ...(question.companionPatch?.(value) ?? {}),
    } as Partial<EligibilityInput>;
    answersRef.current = { ...answersRef.current, ...patch };
    dispatch({ type: "SET_ELIGIBILITY_INPUT", patch });
  }

  async function completeCheck(runId: number) {
    const nextResult = evaluatePrequalification(
      answersRef.current,
      SSA_RULES_2026,
    );
    setCompletedResult(nextResult);
    setScreen("result");
    if (keyboardMode || runId !== runIdRef.current) return;
    try {
      const answer = await voice.ask(
        `The check is complete. ${resultLanguage[nextResult.status].heading}. This does not stop you from applying. Would you like to continue to the application interview?`,
      );
      if (runId !== runIdRef.current) return;
      const parsed = parseYesNo(answer);
      if (parsed.ok && parsed.value) {
        dispatch({ type: "SET_STAGE", stage: "interview" });
      }
    } catch {
      // The visible result and continue action remain fully available.
    }
  }

  function submitTypedAnswer(event: FormEvent) {
    event.preventDefault();
    const question = questions[questionIndex];
    void processAnswer(
      question,
      typedAnswer,
      questionIndex,
      runIdRef.current,
      false,
    );
    setTypedAnswer("");
  }

  function confirmTypedAnswer(confirmed: boolean) {
    const question = questions[questionIndex];
    const parsed = question.parse(lastAnswer);
    if (!parsed.ok) return;
    if (!confirmed) {
      setPendingReadback("");
      setPhase("asking");
      return;
    }
    commitAnswer(question, parsed.value);
    const nextIndex = nextQuestionIndex(questionIndex + 1, answersRef.current);
    if (nextIndex === -1) {
      void completeCheck(runIdRef.current);
      return;
    }
    setQuestionIndex(nextIndex);
    setVisiblePrompt(questions[nextIndex].prompt);
    setPendingReadback("");
    setPhase("asking");
  }

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="mx-auto w-full max-w-[64rem]"
        exit={{ opacity: 0, y: -8 }}
        initial={{ opacity: 0, y: 8 }}
        key={screen}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {screen === "start" ? (
          <StartCheck
            onKeyboard={startKeyboardCheck}
            onStart={() => void startVoiceCheck()}
          />
        ) : null}
        {screen === "conversation" ? (
          <ConversationCheck
            error={flowError ?? voice.error}
            keyboardMode={keyboardMode}
            lastAnswer={lastAnswer}
            onFinish={voice.finishAnswer}
            onPause={voice.pause}
            onReplay={() => void voice.speak(visiblePrompt)}
            onResume={voice.resume}
            onRetry={() => void askQuestion(questionIndex, runIdRef.current)}
            onTypedConfirm={confirmTypedAnswer}
            onTypedSubmit={submitTypedAnswer}
            pendingReadback={pendingReadback}
            phase={phase}
            prompt={visiblePrompt}
            questionNumber={questionIndex + 1}
            setTypedAnswer={setTypedAnswer}
            typedAnswer={typedAnswer}
            voiceLevel={voice.level}
            voiceState={voice.state}
          />
        ) : null}
        {screen === "result" ? (
          <ResultStep
            onContinue={() =>
              dispatch({ type: "SET_STAGE", stage: "interview" })
            }
            onRestart={() => {
              answersRef.current = structuredClone(
                applicantCase.eligibilityInput,
              );
              setScreen("start");
              setCompletedResult(null);
            }}
            result={result}
          />
        ) : null}
      </motion.section>
    </AnimatePresence>
  );
}

function StartCheck({
  onKeyboard,
  onStart,
}: {
  onKeyboard: () => void;
  onStart: () => void;
}) {
  return (
    <div className="pt-[clamp(1rem,6vh,5rem)]">
      <p className="mb-4 inline-flex items-center gap-2 text-sm font-bold text-primary">
        <span className="size-2 rounded-full bg-primary" />
        Voice-first application
      </p>
      <h1 className="max-w-[14ch] text-[clamp(2.65rem,7vw,5.3rem)] font-bold leading-[0.96] tracking-[-0.055em] text-foreground">
        Your voice can complete this application.
      </h1>
      <p className="mt-6 max-w-[39rem] text-lg leading-relaxed text-muted sm:text-xl">
        After one click, I will ask each question aloud, listen, and confirm
        what I heard before saving it.
      </p>

      <div className="mt-9 flex flex-col gap-3 sm:flex-row">
        <Button className="sm:min-w-52" onClick={onStart}>
          <Mic aria-hidden="true" className="size-4" />
          Start voice check
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

      <p className="mt-7 flex items-center gap-2 text-sm text-muted">
        <LockKeyhole aria-hidden="true" className="size-4" />
        Nothing is saved when this tab closes.
      </p>
    </div>
  );
}

function ConversationCheck({
  error,
  keyboardMode,
  lastAnswer,
  onFinish,
  onPause,
  onReplay,
  onResume,
  onRetry,
  onTypedConfirm,
  onTypedSubmit,
  pendingReadback,
  phase,
  prompt,
  questionNumber,
  setTypedAnswer,
  typedAnswer,
  voiceLevel,
  voiceState,
}: {
  error: string | null;
  keyboardMode: boolean;
  lastAnswer: string;
  onFinish: () => void;
  onPause: () => void;
  onReplay: () => void;
  onResume: () => void;
  onRetry: () => void;
  onTypedConfirm: (confirmed: boolean) => void;
  onTypedSubmit: (event: FormEvent) => void;
  pendingReadback: string;
  phase: ConversationPhase;
  prompt: string;
  questionNumber: number;
  setTypedAnswer: (value: string) => void;
  typedAnswer: string;
  voiceLevel: number;
  voiceState: ReturnType<typeof useVoiceTurn>["state"];
}) {
  const status = {
    idle: "Ready",
    requesting: "Waiting for microphone permission",
    speaking: "Speaking",
    listening: "Listening — pause when you are done",
    paused: "Paused — your answer is still here",
    processing: "Turning your answer into text",
    error: "Needs your attention",
  }[voiceState];
  const activeText = phase === "confirming" ? pendingReadback : prompt;

  return (
    <div className="grid gap-8 pb-24 pt-3 lg:grid-cols-[minmax(0,1fr)_20rem] lg:pt-8">
      <section>
        <p className="text-sm font-bold text-primary">
          Voice check · Question {questionNumber}
        </p>
        <h1 className="mt-3 max-w-[19ch] text-4xl font-bold leading-[1.03] tracking-[-0.045em] sm:text-5xl">
          {activeText}
        </h1>

        {!keyboardMode ? (
          <div className="mt-7 overflow-hidden rounded-[var(--radius-surface)] border border-border bg-surface shadow-[0_20px_70px_oklch(0_0_0/0.055)]">
            <div className="relative grid min-h-[22rem] place-items-center bg-surface-subtle/65 p-5 text-center">
              <div
                className="relative size-52 sm:size-64"
                style={{
                  transform: `scale(${1 + voiceLevel * 0.08})`,
                  transition: "transform 100ms linear",
                }}
              >
                <Orb
                  backgroundColor="#000000"
                  forceHoverState={[
                    "speaking",
                    "listening",
                    "processing",
                  ].includes(voiceState)}
                  hoverIntensity={voiceState === "listening" ? 0.65 : 0.3}
                  hue={
                    voiceState === "listening"
                      ? 330
                      : voiceState === "processing"
                        ? 205
                        : 15
                  }
                  rotateOnHover
                />
              </div>
              <p
                aria-live="polite"
                className="mt-2 flex items-center gap-2 font-bold"
              >
                <span
                  className={cn(
                    "size-2 rounded-full bg-muted",
                    voiceState === "listening" && "animate-pulse bg-primary",
                    voiceState === "speaking" && "bg-accent",
                  )}
                />
                {status}
              </p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border p-4">
              {voiceState === "listening" ? (
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
              {voiceState === "paused" ? (
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
        ) : (
          <form
            className="mt-7 rounded-[var(--radius-surface)] border border-border bg-surface p-5 shadow-[0_20px_70px_oklch(0_0_0/0.055)]"
            onSubmit={onTypedSubmit}
          >
            {phase === "confirming" ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={() => onTypedConfirm(true)}>
                  <Check aria-hidden="true" className="size-4" />
                  Yes, that is right
                </Button>
                <Button
                  onClick={() => onTypedConfirm(false)}
                  variant="secondary"
                >
                  No, change it
                </Button>
              </div>
            ) : (
              <>
                <label className="sr-only" htmlFor="typed-check-answer">
                  Answer the current question
                </label>
                <input
                  autoFocus
                  className={inputClassName}
                  id="typed-check-answer"
                  onChange={(event) => setTypedAnswer(event.currentTarget.value)}
                  placeholder="Type one short answer"
                  value={typedAnswer}
                />
                <Button className="mt-3" type="submit">
                  Confirm this answer
                  <ArrowRight aria-hidden="true" className="size-4" />
                </Button>
              </>
            )}
          </form>
        )}

        {error ? (
          <div
            className="mt-4 flex flex-col gap-3 rounded-[var(--radius-control)] bg-danger-soft p-4 text-danger sm:flex-row sm:items-center sm:justify-between"
            role="alert"
          >
            <p className="flex items-center gap-2 text-sm font-bold">
              <CircleAlert aria-hidden="true" className="size-4" />
              {error}
            </p>
            {!keyboardMode ? (
              <Button onClick={onRetry} size="small" variant="secondary">
                <RotateCcw aria-hidden="true" className="size-4" />
                Ask again
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="min-w-0 border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.09em] text-muted">
          Last thing heard
        </p>
        <p className="mt-3 min-h-16 leading-relaxed text-muted">
          {lastAnswer || "Your answer will appear here before it is saved."}
        </p>
        <div className="mt-6 rounded-[var(--radius-control)] bg-accent-soft p-4 text-sm leading-relaxed text-accent">
          Nothing is added until the assistant reads it back and you confirm.
        </div>
      </aside>
    </div>
  );
}

function ResultStep({
  onContinue,
  onRestart,
  result,
}: {
  onContinue: () => void;
  onRestart: () => void;
  result: PrequalificationResult;
}) {
  const language = resultLanguage[result.status];

  return (
    <div className="mx-auto max-w-[46rem] pb-24 pt-4 sm:pt-8">
      <p className="text-sm font-bold text-primary">{language.eyebrow}</p>
      <h1 className="mt-2 max-w-[14ch] text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
        {language.heading}
      </h1>
      <p className="mt-4 max-w-[39rem] text-lg leading-relaxed text-muted">
        {language.detail}
      </p>

      <div className="mt-8 overflow-hidden rounded-[var(--radius-surface)] border border-border bg-surface shadow-[0_18px_60px_oklch(0_0_0/0.05)]">
        <RuleRow result={result.sga} />
        <RuleRow result={result.medicalDuration} />
        <RuleRow result={result.durationOfWork} />
        <RuleRow result={result.recentWork} />
      </div>

      <div className="mt-5 flex gap-3 rounded-[var(--radius-control)] bg-accent-soft p-4 text-sm leading-relaxed text-accent">
        <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p>
          This is a planning screen, not a decision and not a filing gate. SSA
          verifies earnings, work credits, and medical eligibility.
        </p>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Button onClick={onContinue}>
          Continue to my story
          <ArrowRight aria-hidden="true" className="size-4" />
        </Button>
        <Button onClick={onRestart} variant="secondary">
          Start again
        </Button>
      </div>
    </div>
  );
}

function RuleRow({ result }: { result: RuleResult }) {
  const Icon = {
    looks_clear: Check,
    needs_review: CircleAlert,
    uncertain: Info,
  }[result.status];

  return (
    <div className="grid grid-cols-[auto_1fr] gap-3 border-b border-border p-5 last:border-b-0 sm:p-6">
      <span
        className={cn(
          "mt-0.5 grid size-8 place-items-center rounded-full",
          result.status === "looks_clear" && "bg-success-soft text-success",
          result.status === "needs_review" && "bg-warning-soft text-warning",
          result.status === "uncertain" && "bg-accent-soft text-accent",
        )}
      >
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div>
        <h2 className="font-bold">{result.title}</h2>
        <p className="mt-1 leading-relaxed text-muted">{result.reason}</p>
      </div>
    </div>
  );
}

function nextQuestionIndex(
  startingAt: number,
  answers: EligibilityInput,
): number {
  for (let index = startingAt; index < questions.length; index += 1) {
    if (!questions[index].skip?.(answers)) return index;
  }
  return -1;
}

function ageAtOnset(input: EligibilityInput): number | null {
  if (!input.dateOfBirth || !input.allegedOnsetDate) return null;
  const birth = new Date(`${input.dateOfBirth}T00:00:00Z`);
  const onset = new Date(`${input.allegedOnsetDate}T00:00:00Z`);
  if (
    Number.isNaN(birth.valueOf()) ||
    Number.isNaN(onset.valueOf()) ||
    onset < birth
  ) {
    return null;
  }
  let age = onset.getUTCFullYear() - birth.getUTCFullYear();
  if (
    onset.getUTCMonth() < birth.getUTCMonth() ||
    (onset.getUTCMonth() === birth.getUTCMonth() &&
      onset.getUTCDate() < birth.getUTCDate())
  ) {
    age -= 1;
  }
  return age;
}
