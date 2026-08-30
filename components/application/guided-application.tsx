"use client";

import {
  Check,
  CheckCircle2,
  CircleAlert,
  FileCheck2,
  Keyboard,
  Mic,
  Pause,
  RotateCcw,
  Send,
  SkipForward,
  Volume2,
  X,
} from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
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
import type {
  CaseAction,
  InterviewTurn,
  SupportedLocale,
} from "@/lib/case/types";
import { caseReducer } from "@/lib/case/reducer";
import { syntheticApplicant } from "@/lib/case/seed";
import {
  confirmationPrompt,
  confirmationRetry,
  correctionFromRejection,
  explicitNone,
  parseLocalizedYesNo,
  readyAnswer,
} from "@/lib/conversation/answers";
import { buildConversationContext } from "@/lib/conversation/context";
import {
  parseVoiceCommand,
  type ParsedVoiceCommand,
} from "@/lib/conversation/commands";
import {
  evaluateCompleteness,
  type CompletionResult,
} from "@/lib/conversation/completeness";
import {
  QUESTION_REGISTRY,
  nextQuestion,
  questionById,
  type QuestionDefinition,
} from "@/lib/conversation/questions";
import { applyInterviewExtraction } from "@/lib/extraction/apply";
import { requestInterviewExtraction } from "@/lib/extraction/client";
import type { InterviewExtraction } from "@/lib/extraction/schema";
import {
  copy,
  localeDefinition,
  localized,
  preparationItems,
  SUPPORTED_LOCALES,
} from "@/lib/i18n/locales";
import { parseSpokenNumber } from "@/lib/voice/answer-parsers";
import { cn } from "@/lib/utils";

type ConversationStatus =
  | "idle"
  | "introducing"
  | "waiting"
  | "asking"
  | "extracting"
  | "confirming"
  | "paused"
  | "review"
  | "complete"
  | "error";

interface PendingAnswer {
  question: QuestionDefinition;
  transcript: string;
  turnId: string;
  source: Extract<InterviewTurn["source"], "voice" | "typed">;
  summary: string;
  extraction: InterviewExtraction | null;
  directActions: CaseAction[];
  commitActions: CaseAction[];
  turnIds: string[];
  followUpCount: number;
}

export function GuidedApplication() {
  const { applicantCase, dispatch, setVoiceSessionActive } =
    useApplicantCase();
  const locale = applicantCase.conversationLocale ?? "en-US";
  const voice = useVoiceTurn(locale);
  const [status, setStatus] = useState<ConversationStatus>(
    applicantCase.applicationPhase === "ready" ? "complete" : "idle",
  );
  const [cursor, setCursor] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [typedMode, setTypedMode] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [pending, setPending] = useState<PendingAnswer | null>(null);
  const [repairPrompt, setRepairPrompt] = useState<string | null>(null);
  const [activatedStartLocale, setActivatedStartLocale] =
    useState<SupportedLocale | null>(null);
  const runIdRef = useRef(0);
  const caseRef = useRef(applicantCase);
  const localeResumeQuestionIdRef = useRef<string | null>(null);
  const processedStartLocaleRef = useRef<SupportedLocale | null>(null);
  const currentQuestion = questionById(applicantCase.activeQuestionId);
  const completion = useMemo(
    () => evaluateCompleteness(applicantCase, locale),
    [applicantCase, locale],
  );
  const sampleCaseReady =
    applicantCase.mode === "synthetic_demo" &&
    applicantCase.applicationPhase === "ready";
  useEffect(() => {
    caseRef.current = applicantCase;
  }, [applicantCase]);

  useEffect(
    () => () => {
      runIdRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (
      activatedStartLocale === locale &&
      processedStartLocaleRef.current !== activatedStartLocale
    ) {
      processedStartLocaleRef.current = activatedStartLocale;
      // The effect intentionally resumes the current function-declared workflow.
      // eslint-disable-next-line react-hooks/immutability
      void continueLanguageStart(activatedStartLocale);
    }
    const resumeQuestionId = localeResumeQuestionIdRef.current;
    if (resumeQuestionId) {
      localeResumeQuestionIdRef.current = null;
      const question = questionById(resumeQuestionId);
      if (question) {
        // The question runner is stable for the lifetime of this render.
        // eslint-disable-next-line react-hooks/immutability
        window.setTimeout(() => void askQuestion(question), 120);
      }
    }
    // Locale state must render before localized speech/listen resumes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activatedStartLocale, locale]);

  async function listenContinuously(
    selectedLocale: SupportedLocale,
    expectedRunId: number,
  ): Promise<string> {
    while (expectedRunId === runIdRef.current) {
      try {
        const transcript = await voice.listen();
        setError(null);
        return transcript;
      } catch (listeningError) {
        if (
          expectedRunId !== runIdRef.current ||
          isMicrophoneUnavailableError(listeningError)
        ) {
          throw listeningError;
        }
        const message = listeningAgain(selectedLocale);
        setStatus("waiting");
        setError(message);
        await voice.speak(message);
      }
    }
    throw new Error("The conversation moved to another step.");
  }

  async function askContinuously(
    prompt: string,
    selectedLocale: SupportedLocale,
    expectedRunId = runIdRef.current,
  ) {
    await voice.speak(prompt);
    return listenContinuously(selectedLocale, expectedRunId);
  }

  async function chooseLanguage(nextLocale: SupportedLocale) {
    const runId = ++runIdRef.current;
    const definition = localeDefinition(nextLocale);
    dispatch({ type: "SET_CONVERSATION_LOCALE", locale: nextLocale });
    dispatch({
      type: "EDIT_VALUE",
      path: "applicant.preferredLanguage",
      value: definition.preferredLanguageValue,
    });
    dispatch({ type: "SET_APPLICATION_PHASE", phase: "introduction" });
    setVoiceSessionActive(true);
    setStatus("introducing");
    setError(null);
    try {
      await voice.activate();
      if (runId !== runIdRef.current) return;
      setActivatedStartLocale(nextLocale);
    } catch {
      if (runId !== runIdRef.current) return;
      dispatch({
        type: "SET_APPLICATION_PHASE",
        phase: "document_readiness",
      });
      setTypedMode(true);
      setStatus("error");
      setError(microphoneUnavailable(nextLocale));
    }
  }

  async function continueLanguageStart(nextLocale: SupportedLocale) {
    const runId = runIdRef.current;
    try {
      await voice.speak(localized(copy.introduction, nextLocale));
      if (runId !== runIdRef.current) return;
      dispatch({
        type: "SET_APPLICATION_PHASE",
        phase: "document_readiness",
      });
      setStatus("waiting");
      const answer = await listenContinuously(nextLocale, runId);
      if (runId !== runIdRef.current) return;
      if (readyAnswer(answer, nextLocale)) {
        markRemainingPreparationReady();
        beginIntake();
      } else {
        trackMissingPreparation(answer, nextLocale);
        const nextAnswer = await askContinuously(
          readinessNoted(nextLocale),
          nextLocale,
          runId,
        );
        if (readyAnswer(nextAnswer, nextLocale)) {
          markRemainingPreparationReady();
          beginIntake();
        } else {
          trackMissingPreparation(nextAnswer, nextLocale);
          setTypedMode(true);
          setError(localized(copy.readyPrompt, nextLocale));
        }
      }
    } catch {
      if (runId !== runIdRef.current) return;
      dispatch({
        type: "SET_APPLICATION_PHASE",
        phase: "document_readiness",
      });
      setTypedMode(true);
      setStatus("error");
      setError(microphoneUnavailable(nextLocale));
    }
  }

  function beginIntake() {
    ++runIdRef.current;
    setError(null);
    setTypedMode(false);
    dispatch({ type: "SET_APPLICATION_PHASE", phase: "intake" });
    const first = nextQuestion(caseRef.current);
    if (!first) {
      void finishIntake();
      return;
    }
    const nextCursor = QUESTION_REGISTRY.findIndex(
      (entry) => entry.id === first.id,
    );
    setCursor(nextCursor);
    window.setTimeout(() => void askAt(nextCursor), 120);
  }

  function markRemainingPreparationReady() {
    preparationItems.forEach((item) => {
      if (!caseRef.current.documentReadiness[item.id]) {
        dispatch({
          type: "SET_DOCUMENT_READINESS",
          documentId: item.id,
          status: "ready",
        });
      }
    });
  }

  function trackMissingPreparation(
    transcript: string,
    selectedLocale: SupportedLocale,
  ) {
    const normalized = transcript.toLocaleLowerCase();
    preparationItems.forEach((item) => {
      const labels = [
        item.label["en-US"],
        item.label["es-US"],
        item.label["zh-CN"],
      ];
      const terms = documentTerms(item.id);
      if (
        labels.some((label) =>
          normalized.includes(label.toLocaleLowerCase()),
        ) ||
        terms[selectedLocale].some((term) => normalized.includes(term))
      ) {
        dispatch({
          type: "SET_DOCUMENT_READINESS",
          documentId: item.id,
          status: "follow_up",
        });
      }
    });
  }

  async function askAt(startIndex: number) {
    const currentCase = caseRef.current;
    let index = startIndex;
    let question: QuestionDefinition | null = null;
    while (index < QUESTION_REGISTRY.length) {
      const candidate = QUESTION_REGISTRY[index];
      const deferred = currentCase.deferredItems.some(
        (item) => item.questionId === candidate.id,
      );
      if (
        candidate.isActive(currentCase) &&
        !candidate.isAnswered(currentCase) &&
        !deferred
      ) {
        question = candidate;
        break;
      }
      index += 1;
    }
    if (!question) {
      await finishIntake();
      return;
    }
    setCursor(index);
    await askQuestion(question);
  }

  async function askQuestion(question: QuestionDefinition) {
    const runId = runIdRef.current;
    dispatch({ type: "SET_ACTIVE_QUESTION", questionId: question.id });
    setPending(null);
    setRepairPrompt(null);
    setError(null);
    setTypedMode(false);
    setStatus("asking");
    try {
      const transcript = await askContinuously(
        localized(question.prompt, locale),
        locale,
        runId,
      );
      if (runId !== runIdRef.current) return;
      await processTranscript(question, transcript, "voice");
    } catch {
      if (runId !== runIdRef.current) return;
      setTypedMode(true);
      setStatus("error");
      setError(microphoneUnavailable(locale));
    }
  }

  async function processTranscript(
    question: QuestionDefinition,
    rawTranscript: string,
    source: PendingAnswer["source"],
  ) {
    const transcript = rawTranscript.trim();
    if (!transcript) {
      setError(localized(copy.typeAnswer, locale));
      return;
    }
    setRepairPrompt(null);
    const command = parseVoiceCommand(transcript, locale);
    if (command) {
      await handleCommand(command, question);
      return;
    }

    const turnId = `turn-${crypto.randomUUID()}`;
    dispatch({
      type: "ADD_INTERVIEW_TURN",
      turn: {
        id: turnId,
        prompt: localized(question.prompt, locale),
        transcript,
        source,
        status: "extracting",
        createdAt: new Date().toISOString(),
        locale,
      },
    });
    setStatus("extracting");
    setError(null);

    try {
      const preparation = prepareAnswer(
        question,
        transcript,
        source,
        turnId,
      );
      let acknowledgement: Promise<void> | null = null;
      const acknowledgementTimer =
        source === "voice"
          ? window.setTimeout(() => {
              acknowledgement = voice.speak(
                processingAcknowledgement(question, locale),
              );
            }, 250)
          : null;
      let nextPending: PendingAnswer;
      try {
        nextPending = await preparation;
      } finally {
        if (acknowledgementTimer !== null) {
          window.clearTimeout(acknowledgementTimer);
        }
      }
      if (acknowledgement) {
        await acknowledgement;
      }
      setPending(nextPending);
      setStatus("confirming");
      if (source === "voice") {
        await continueVoiceConversation(nextPending);
      }
    } catch (processingError) {
      dispatch({
        type: "UPDATE_INTERVIEW_TURN",
        turnId,
        patch: { status: "failed" },
      });
      setTypedMode(true);
      setStatus("error");
      setError(
        isMicrophoneUnavailableError(processingError)
          ? microphoneUnavailable(locale)
          : locale === "en-US" && processingError instanceof Error
            ? processingError.message
            : answerProcessingFailed(locale),
      );
    }
  }

  async function prepareAnswer(
    question: QuestionDefinition,
    transcript: string,
    source: PendingAnswer["source"],
    turnId: string,
  ): Promise<PendingAnswer> {
    const directActions: CaseAction[] = [];
    let extraction: InterviewExtraction | null = null;
    let summary = transcript;
    const extractWithContext = () =>
      requestInterviewExtraction({
        turnId,
        locale,
        topic: question.id,
        prompt: localized(question.prompt, locale),
        transcript,
        history: buildConversationContext(
          caseRef.current.interviewTurns,
        ),
      });

    if (question.answerKind === "yes_no") {
      const parsed = parseLocalizedYesNo(transcript, locale);
      if (!parsed.ok) {
        throw new Error(confirmationRetry(locale));
      }
      summary = parsed.spoken;
      if (question.id === "current-work") {
        directActions.push({
          type: "EDIT_VALUE",
          path: "currentlyEarning",
          value: parsed.value,
        });
      } else if (question.id === "statutory-blindness") {
        directActions.push({
          type: "SET_ELIGIBILITY_INPUT",
          patch: { statutorilyBlind: parsed.value },
        });
      } else if (question.id === "condition-duration") {
        directActions.push({
          type: "SET_ELIGIBILITY_INPUT",
          patch: { conditionExpectedToLast12Months: parsed.value },
        });
      }
      if (hasConversationalDetail(transcript, locale)) {
        extraction = await extractWithContext();
        summary = extraction.summary;
      }
    } else if (question.answerKind === "currency") {
      const amount = parseSpokenNumber(transcript);
      if (amount === null || amount < 0) {
        throw new Error(
          locale === "es-US"
            ? "Diga una cantidad en dólares."
            : locale === "zh-CN"
              ? "请说出美元金额。"
              : "Say a dollar amount.",
        );
      }
      summary = new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(amount);
      directActions.push({
        type: "SET_ELIGIBILITY_INPUT",
        patch: { monthlyEarningsUsd: amount },
      });
      if (hasConversationalDetail(transcript, locale)) {
        extraction = await extractWithContext();
        summary = extraction.summary;
      }
    } else if (
      isCollectionQuestion(question) &&
      explicitNone(transcript, locale)
    ) {
      const collection = question.answerKind;
      const hasItems = caseRef.current[collection].length > 0;
      directActions.push({
        type: "SET_COLLECTION_COMPLETION",
        collection,
        status: hasItems ? "complete_with_items" : "complete_none",
      });
      summary = transcript;
    } else {
      extraction = await extractWithContext();
      summary = extraction.summary;
    }

    if (extraction) {
      if (isCollectionQuestion(question)) {
        const collection = question.answerKind;
        const extractedItems = extraction.facts.some(
          (fact) => fact.kind === singularCollectionKind(collection),
        );
        directActions.push({
          type: "SET_COLLECTION_COMPLETION",
          collection,
          status:
            collection === "providers" &&
            extraction.providerListStatus === "complete"
              ? "complete_with_items"
              : extractedItems
                ? "in_progress"
                : "unanswered",
        });
      }

      if (question.id === "citizenship") {
        const parsed = parseLocalizedYesNo(transcript, locale);
        if (parsed.ok) {
          directActions.push({
            type: "EDIT_VALUE",
            path: "nonCitizen",
            value: !parsed.value,
          });
          if (parsed.value) {
            directActions.push({
              type: "EDIT_VALUE",
              path: "applicant.citizenship",
              value: "United States",
            });
          }
        }
      }
      const birthDate = REDACTED(extraction, "applicant.dateOfBirth");
      if (birthDate) {
        directActions.push({
          type: "SET_ELIGIBILITY_INPUT",
          patch: { dateOfBirth: birthDate },
        });
      }
      const onsetDate = REDACTED(
        extraction,
        "condition.allegedOnsetDate",
      );
      if (onsetDate) {
        directActions.push({
          type: "SET_ELIGIBILITY_INPUT",
          patch: { allegedOnsetDate: onsetDate },
        });
        if (
          question.id === "onset-date" &&
          caseRef.current.conditions.length
        ) {
          directActions.push({
            type: "EDIT_VALUE",
            path: "conditions.0.allegedOnsetDate",
            value: onsetDate,
          });
        }
      }
      if (
        question.id === "work-effects" &&
        caseRef.current.conditions.length
      ) {
        const effects = extraction.facts
          .filter((fact) => fact.field === "condition.workEffect")
          .map((fact) => fact.value);
        directActions.push({
          type: "EDIT_VALUE",
          path: "conditions.0.workEffects",
          value: effects.length ? effects : [extraction.summary],
        });
      }
    }

    const commitActions = buildCommitActions({
      directActions,
      extraction,
      source,
      turnId,
    });

    return {
      question,
      transcript,
      turnId,
      source,
      summary,
      extraction,
      directActions,
      commitActions,
      turnIds: [turnId],
      followUpCount: 0,
    };
  }

  async function continueVoiceConversation(answer: PendingAnswer) {
    const preview = previewPending(answer);
    const followUp =
      answer.followUpCount < 2 &&
      answer.extraction?.answerComplete === false &&
      answer.extraction.followUpQuestion.trim()
        ? answer.extraction.followUpQuestion.trim()
        : null;
    const next = followUp
      ? answer.question
      : nextQuestionForCase(preview);
    const confirmation = explicitConfirmationPrompt(answer, locale);
    setPending(answer);
    setRepairPrompt(confirmation);
    setStatus("confirming");

    try {
      const response = await askContinuously(confirmation, locale);
      const confirmationCommand = parseVoiceCommand(response, locale);
      if (confirmationCommand?.command === "repeat") {
        await continueVoiceConversation(answer);
        return;
      }
      if (confirmationCommand?.command === "explain") {
        await voice.speak(
          localized(answer.question.explanation, locale),
        );
        await continueVoiceConversation(answer);
        return;
      }
      if (confirmationCommand?.command === "correct") {
        rejectPending(answer);
        await requestVoiceCorrection(answer.question);
        return;
      }
      const correction = contextualCorrection(response, locale);
      const decision = parseLocalizedYesNo(response, locale);
      if (correction.isCorrection || (decision.ok && !decision.value)) {
        rejectPending(answer);
        if (correction.replacement) {
          await voice.speak(
            localized(copy.correctionAcknowledged, locale),
          );
          await processTranscript(
            answer.question,
            correction.replacement,
            "voice",
          );
        } else {
          await requestVoiceCorrection(answer.question);
        }
        return;
      }

      if (!decision.ok) {
        rejectPending(answer);
        await voice.speak(localized(copy.correctionAcknowledged, locale));
        await processTranscript(answer.question, response, "voice");
        return;
      }

      if (followUp) {
        const bridge = confirmationBridge(followUp, locale);
        setRepairPrompt(bridge);
        setStatus("asking");
        const detail = await askContinuously(bridge, locale);
        await continueFollowUp(answer, detail);
        return;
      }

      commitPending(answer);
      if (!next) {
        await voice.speak(confirmationAccepted(locale));
        window.setTimeout(() => void finishIntake(), 120);
        return;
      }

      const nextIndex = QUESTION_REGISTRY.findIndex(
        (candidate) => candidate.id === next.id,
      );
      const nextPrompt =
        next.id === answer.question.id &&
        isCollectionQuestion(answer.question)
          ? collectionContinuationPrompt(answer.question, locale)
          : localized(next.prompt, locale);
      const bridge = confirmationBridge(nextPrompt, locale);
      dispatch({ type: "SET_ACTIVE_QUESTION", questionId: next.id });
      setCursor(Math.max(0, nextIndex));
      setRepairPrompt(bridge);
      setStatus("asking");
      const nextResponse = await askContinuously(bridge, locale);
      await processTranscript(next, nextResponse, "voice");
    } catch (conversationError) {
      setTypedMode(true);
      setStatus("error");
      setError(
        isMicrophoneUnavailableError(conversationError)
          ? microphoneUnavailable(locale)
          : answerProcessingFailed(locale),
      );
    }
  }

  async function continueFollowUp(
    answer: PendingAnswer,
    response: string,
  ) {
    const followUpTurnId = `turn-${crypto.randomUUID()}`;
    const combinedTranscript = `${answer.transcript}\nAdditional detail: ${response}`;
    dispatch({
      type: "ADD_INTERVIEW_TURN",
      turn: {
        id: followUpTurnId,
        prompt:
          answer.extraction?.followUpQuestion ||
          localized(answer.question.prompt, locale),
        transcript: response,
        source: "voice",
        status: "extracting",
        createdAt: new Date().toISOString(),
        locale,
      },
    });
    const revised = await prepareAnswer(
      answer.question,
      combinedTranscript,
      "voice",
      followUpTurnId,
    );
    revised.turnIds = [...answer.turnIds, followUpTurnId];
    revised.followUpCount = answer.followUpCount + 1;
    setPending(revised);
    await continueVoiceConversation(revised);
  }

  async function requestVoiceCorrection(question: QuestionDefinition) {
    const runId = runIdRef.current;
    const prompt = localized(copy.correctionPrompt, locale);
    setRepairPrompt(prompt);
    setError(null);
    setStatus("asking");
    try {
      const correction = await askContinuously(prompt, locale, runId);
      if (runId !== runIdRef.current) return;
      await processTranscript(question, correction, "voice");
    } catch (correctionError) {
      if (runId !== runIdRef.current) return;
      setTypedMode(true);
      setStatus("error");
      setError(
        isMicrophoneUnavailableError(correctionError)
          ? microphoneUnavailable(locale)
          : answerProcessingFailed(locale),
      );
    }
  }

  function requestTypedCorrection(answer: PendingAnswer) {
    rejectPending(answer);
    setRepairPrompt(localized(copy.correctionPrompt, locale));
    setError(null);
    setStatus("asking");
    setTypedMode(true);
  }

  function commitPending(answer: PendingAnswer) {
    let nextCase = caseRef.current;
    answer.commitActions.forEach((action) => {
      dispatch(action);
      nextCase = caseReducer(nextCase, action);
    });
    answer.turnIds.forEach((turnId) => {
      const action: CaseAction = {
        type: "UPDATE_INTERVIEW_TURN",
        turnId,
        patch: {
          status: "extracted",
          canonicalSummary: answer.extraction?.summary ?? answer.summary,
        },
      };
      dispatch(action);
      nextCase = caseReducer(nextCase, action);
    });
    const resolveAction: CaseAction = {
      type: "RESOLVE_DEFERRED_QUESTION",
      questionId: answer.question.id,
    };
    dispatch(resolveAction);
    nextCase = caseReducer(nextCase, resolveAction);
    caseRef.current = nextCase;
    setPending(null);
    setTypedAnswer("");
  }

  function rejectPending(answer: PendingAnswer) {
    answer.turnIds.forEach((turnId) => {
      dispatch({
        type: "UPDATE_INTERVIEW_TURN",
        turnId,
        patch: { status: "final" },
      });
    });
    setPending(null);
    setTypedAnswer("");
  }

  function previewPending(answer: PendingAnswer) {
    return answer.commitActions.reduce(
      (preview, action) => caseReducer(preview, action),
      caseRef.current,
    );
  }

  async function handleCommand(
    command: ParsedVoiceCommand,
    question: QuestionDefinition,
  ) {
    switch (command.command) {
      case "repeat":
        await askQuestion(question);
        return;
      case "explain":
        await voice.speak(localized(question.explanation, locale));
        await askQuestion(question);
        return;
      case "pause":
        ++runIdRef.current;
        voice.pause();
        setStatus("paused");
        await voice.speak(localized(copy.sessionPaused, locale));
        return;
      case "continue":
        await askQuestion(question);
        return;
      case "go_back": {
        const previous = Math.max(0, cursor - 1);
        setCursor(previous);
        await askAt(previous);
        return;
      }
      case "correct": {
        const confirmation = await askContinuously(
          correctionTargetPrompt(question, locale),
          locale,
        );
        const parsed = parseLocalizedYesNo(confirmation, locale);
        if (parsed.ok && parsed.value) {
          await askQuestion(question);
        } else {
          await voice.speak(localized(copy.answerNotConfirmed, locale));
          await askQuestion(question);
        }
        return;
      }
      case "defer":
        dispatch({
          type: "DEFER_QUESTION",
          item: {
            questionId: question.id,
            deferredAt: new Date().toISOString(),
            reason: command.deferReason ?? "come_back_later",
          },
        });
        await voice.speak(localized(copy.requiredCannotSkip, locale));
        window.setTimeout(() => void askAt(cursor + 1), 120);
        return;
      case "status": {
        const result = evaluateCompleteness(caseRef.current, locale);
        await voice.speak(statusMessage(result, locale));
        await askQuestion(question);
        return;
      }
      case "change_language":
        if (command.targetLocale) {
          ++runIdRef.current;
          dispatch({
            type: "SET_CONVERSATION_LOCALE",
            locale: command.targetLocale,
          });
          dispatch({
            type: "EDIT_VALUE",
            path: "applicant.preferredLanguage",
            value: localeDefinition(command.targetLocale)
              .preferredLanguageValue,
          });
          localeResumeQuestionIdRef.current = question.id;
        }
        return;
      case "review":
        await finishIntake();
        return;
      case "generate_packet":
        if (evaluateCompleteness(caseRef.current, locale).ready) {
          dispatch({ type: "SET_STAGE", stage: "documents" });
        } else {
          await voice.speak(incompleteMessage(locale));
          await askQuestion(question);
        }
        return;
      case "open_records":
        dispatch({ type: "SET_STAGE", stage: "records" });
        return;
      case "download_packet":
      case "mark_received":
        await voice.speak(commandUnavailableHere(locale));
        await askQuestion(question);
        return;
    }
  }

  async function finishIntake() {
    dispatch({ type: "SET_ACTIVE_QUESTION", questionId: null });
    dispatch({ type: "SET_APPLICATION_PHASE", phase: "issue_resolution" });
    setStatus("review");
    await new Promise((resolve) => window.setTimeout(resolve, 80));
    const result = evaluateCompleteness(caseRef.current, locale);
    const unresolved = result.blocking.filter(
      (issue) => issue.id !== "final-review",
    );
    if (unresolved.length) {
      await voice.speak(unresolvedMessage(unresolved.length, locale));
      return;
    }
    const confirmation = await askContinuously(
      finalReviewPrompt(locale),
      locale,
    );
    const parsed = parseLocalizedYesNo(confirmation, locale);
    if (parsed.ok && parsed.value) {
      dispatch({ type: "SET_FINAL_REVIEW_APPROVED", approved: true });
      dispatch({ type: "SET_APPLICATION_PHASE", phase: "ready" });
      setStatus("complete");
      await voice.speak(finalReadyMessage(locale));
      dispatch({ type: "SET_STAGE", stage: "documents" });
      return;
    }
    setStatus("review");
  }

  function resolveIssue(questionId: string) {
    const index = QUESTION_REGISTRY.findIndex(
      (entry) => entry.id === questionId,
    );
    if (index < 0) return;
    setCursor(index);
    dispatch({ type: "SET_APPLICATION_PHASE", phase: "issue_resolution" });
    void askAt(index);
  }

  function submitTypedAnswer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      applicantCase.applicationPhase === "document_readiness"
    ) {
      if (!readyAnswer(typedAnswer, locale)) {
        trackMissingPreparation(typedAnswer, locale);
        setTypedAnswer("");
        setError(readinessNoted(locale));
        return;
      }
      markRemainingPreparationReady();
      setTypedAnswer("");
      beginIntake();
      return;
    }
    if (currentQuestion) {
      void processTranscript(currentQuestion, typedAnswer, "typed");
    }
  }

  function confirmTyped(confirmed: boolean) {
    if (!pending) return;
    if (!confirmed) {
      requestTypedCorrection(pending);
      return;
    }
    commitPending(pending);
    window.setTimeout(() => void askAt(cursor), 120);
  }

  function loadElenaSample() {
    ++runIdRef.current;
    voice.cancel();
    setVoiceSessionActive(false);
    dispatch({
      type: "LOAD_CASE",
      applicantCase: structuredClone(syntheticApplicant),
    });
    setCursor(QUESTION_REGISTRY.length);
    setError(null);
    setPending(null);
    setRepairPrompt(null);
    setTypedAnswer("");
    setTypedMode(false);
    setStatus("complete");
  }

  function pauseForSampleDialog() {
    ++runIdRef.current;
    voice.cancel();
    setVoiceSessionActive(false);
    setStatus("paused");
  }

  function resumeAfterSampleDialog() {
    setVoiceSessionActive(true);
    setError(null);
    if (currentQuestion) {
      setStatus("asking");
      window.setTimeout(() => void askQuestion(currentQuestion), 120);
    }
  }

  if (applicantCase.applicationPhase === "language") {
    return <LanguageSelection onSelect={chooseLanguage} />;
  }

  const activePrompt = currentQuestion
    ? status === "confirming" && pending
      ? repairPrompt ?? explicitConfirmationPrompt(pending, locale)
      : repairPrompt ?? localized(currentQuestion.prompt, locale)
    : localized(copy.introduction, locale);

  return (
    <div className="mx-auto grid w-full max-w-[75rem] gap-6 pb-24 pt-2 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10 lg:pt-6">
      <section className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-primary">
              {localized(copy.application, locale)}
            </p>
            <p className="mt-1 text-sm text-muted">
              {completion.answered} / {completion.total}
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {currentQuestion && !sampleCaseReady ? (
              <SampleFillDialog
                onCancel={resumeAfterSampleDialog}
                onConfirm={loadElenaSample}
                onOpen={pauseForSampleDialog}
              />
            ) : null}
            <LanguageMenu
              locale={locale}
              onChange={(nextLocale) => {
                dispatch({
                  type: "SET_CONVERSATION_LOCALE",
                  locale: nextLocale,
                });
                dispatch({
                  type: "EDIT_VALUE",
                  path: "applicant.preferredLanguage",
                  value: localeDefinition(nextLocale).preferredLanguageValue,
                });
              }}
            />
          </div>
        </header>

        <div className="mt-5 overflow-hidden rounded-[1.15rem] border border-border bg-surface shadow-[0_22px_70px_oklch(0_0_0/0.055)]">
          <div className="relative min-h-[11rem] overflow-hidden border-b border-border bg-[oklch(0.975_0.012_356.8)] sm:min-h-[13rem]">
            <div className="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 sm:size-64">
              <Orb
                backgroundColor="#fbf7f9"
                forceHoverState={
                  voice.state === "listening" || status === "asking"
                }
                hoverIntensity={0.35}
                hue={330}
              />
            </div>
            {voice.state === "speaking" ? (
              <Button
                aria-label={
                  locale === "es-US"
                    ? "Omitir el audio y responder ahora"
                    : locale === "zh-CN"
                      ? "跳过语音并立即回答"
                      : "Skip audio and answer now"
                }
                className="absolute right-4 top-4 z-10 shadow-sm sm:right-5 sm:top-5"
                onClick={() => voice.skipSpeech()}
                size="small"
                variant="secondary"
              >
                <SkipForward aria-hidden="true" className="size-4" />
                {locale === "es-US"
                  ? "Omitir"
                  : locale === "zh-CN"
                    ? "跳过"
                    : "Skip"}
              </Button>
            ) : null}
            <VoiceState locale={locale} state={voice.state} status={status} />
          </div>

          <div className="p-5 sm:p-8">
            {applicantCase.applicationPhase === "introduction" ||
            applicantCase.applicationPhase === "document_readiness" ? (
              <Preparation
                locale={locale}
                readiness={applicantCase.documentReadiness}
                showIntroduction={
                  applicantCase.applicationPhase === "introduction" ||
                  status === "error"
                }
              />
            ) : null}

            {currentQuestion ? (
              <AnimatePresence mode="wait">
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  initial={{ opacity: 0, y: 5 }}
                  key={`${currentQuestion.id}-${status}-${activePrompt}`}
                >
                  <p className="text-sm font-bold text-muted">
                    {Math.min(cursor + 1, completion.total)} / {completion.total}
                  </p>
                  <h1 className="mt-3 max-w-[22ch] text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-balance sm:text-4xl">
                    {activePrompt}
                  </h1>
                  {!repairPrompt && status !== "confirming" ? (
                    <button
                      className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 text-sm font-bold text-primary hover:bg-primary-soft"
                      onClick={() =>
                        void voice.speak(
                          localized(currentQuestion.explanation, locale),
                        )
                      }
                      type="button"
                    >
                      <CircleAlert aria-hidden="true" className="size-4" />
                      {locale === "es-US"
                        ? "Por qué se necesita"
                        : locale === "zh-CN"
                          ? "为什么需要"
                          : "Why it is needed"}
                    </button>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            ) : null}

            {sampleCaseReady ? (
              <SampleReadyState
                onContinue={() =>
                  dispatch({ type: "SET_STAGE", stage: "documents" })
                }
              />
            ) : null}

            {status === "review" ? (
              <ReviewIssues
                completion={completion}
                locale={locale}
                onResolve={resolveIssue}
              />
            ) : null}

            {error ? (
              <p
                aria-live="assertive"
                className="mt-5 rounded-[var(--radius-control)] bg-danger-soft p-3.5 text-sm font-bold text-danger"
              >
                {error}
              </p>
            ) : null}

            {pending && pending.source === "typed" ? (
              <div className="mt-6 border-t border-border pt-5">
                <p className="text-sm font-bold text-muted">
                  {explicitConfirmationPrompt(pending, locale)}
                </p>
                <div className="mt-4 flex gap-3">
                  <Button onClick={() => confirmTyped(true)}>
                    <Check aria-hidden="true" className="size-4" />
                    {locale === "es-US"
                      ? "Correcto"
                      : locale === "zh-CN"
                        ? "正确"
                        : "Correct"}
                  </Button>
                  <Button
                    onClick={() => confirmTyped(false)}
                    variant="secondary"
                  >
                    {locale === "es-US"
                      ? "Cambiar"
                      : locale === "zh-CN"
                        ? "修改"
                        : "Change"}
                  </Button>
                </div>
              </div>
            ) : null}

            {typedMode ? (
              <TypedAnswer
                locale={locale}
                onChange={setTypedAnswer}
                onSubmit={submitTypedAnswer}
                value={typedAnswer}
              />
            ) : null}

            {!sampleCaseReady ? (
              <ConversationControls
                locale={locale}
                onFinish={() => voice.finishAnswer()}
                onPause={() => {
                  if (voice.state === "paused") voice.resume();
                  else voice.pause();
                }}
                onRepeat={() => void voice.speak(activePrompt)}
                onType={() => setTypedMode((visible) => !visible)}
                showTypeAction={!typedMode}
                state={voice.state}
              />
            ) : null}
          </div>
        </div>
      </section>

      <ContextPanel applicantCase={applicantCase} locale={locale} />
    </div>
  );
}

function LanguageSelection({
  onSelect,
}: {
  onSelect: (locale: SupportedLocale) => void;
}) {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-8rem)] w-full max-w-[58rem] flex-col justify-center py-8">
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <h1 className="max-w-[18ch] text-4xl font-bold leading-[1.03] tracking-[-0.04em] text-balance sm:text-5xl">
            Which language would you like to use?
          </h1>
          <p className="mt-5 max-w-[43rem] text-lg leading-relaxed text-muted">
            Prepare your SSDI application and organize the supporting records
            through a guided conversation.
          </p>
          <div
            aria-label="Language options"
            className="mt-8 grid gap-3 sm:grid-cols-3"
            role="group"
          >
            {SUPPORTED_LOCALES.map((entry) => (
              <motion.button
                className="group flex min-h-20 items-center justify-between rounded-[var(--radius-surface)] border border-border bg-surface px-5 text-left text-lg font-bold shadow-[0_8px_30px_oklch(0_0_0/0.04)] transition-[border-color,background-color,transform] hover:-translate-y-0.5 hover:border-primary/45 hover:bg-primary-soft/45"
                key={entry.id}
                onClick={() => void onSelect(entry.id)}
                type="button"
                whileTap={{ scale: 0.985 }}
              >
                {entry.nativeLabel}
                <span className="grid size-8 place-items-center rounded-full bg-surface-subtle text-xs text-muted transition-colors group-hover:bg-surface group-hover:text-primary">
                  {entry.shortLabel}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
        <div className="mx-auto size-60 [mask-image:radial-gradient(circle,black_58%,transparent_74%)] lg:size-72">
          <Orb backgroundColor="#fcf9fb" hoverIntensity={0.28} hue={330} />
        </div>
      </div>
    </section>
  );
}

function SampleFillDialog({
  onCancel,
  onConfirm,
  onOpen,
}: {
  onCancel: () => void;
  onConfirm: () => void;
  onOpen: () => void;
}) {
  const confirmedRef = useRef(false);
  return (
    <Dialog.Root
      onOpenChange={(open) => {
        if (open) {
          confirmedRef.current = false;
          onOpen();
          return;
        }
        if (!confirmedRef.current) onCancel();
        confirmedRef.current = false;
      }}
    >
      <Dialog.Trigger asChild>
        <Button
          aria-label="Fill demo application"
          size="small"
          variant="secondary"
        >
          <FileCheck2 aria-hidden="true" className="size-4" />
          <span className="hidden sm:inline">Fill demo application</span>
          <span className="sm:hidden">Demo</span>
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/35" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-[1.15rem] bg-surface p-6 shadow-[0_28px_90px_oklch(0_0_0/0.24)] sm:p-7">
          <Dialog.Title className="pr-10 text-2xl font-bold tracking-[-0.025em]">
            Replace these answers with Elena Rivera’s sample?
          </Dialog.Title>
          <Dialog.Description className="mt-3 leading-relaxed text-muted">
            This replaces the current application answers. It does not create
            computer-search results; those still come from real Windows files.
          </Dialog.Description>
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary">Keep current answers</Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button
                onClick={() => {
                  confirmedRef.current = true;
                  onConfirm();
                }}
              >
                Load Elena sample
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Close
            aria-label="Close"
            className="absolute right-4 top-4 grid size-10 place-items-center rounded-[var(--radius-control)] text-muted transition-colors hover:bg-surface-subtle hover:text-foreground"
          >
            <X aria-hidden="true" className="size-5" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SampleReadyState({ onContinue }: { onContinue: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-bold text-success">
        <CheckCircle2 aria-hidden="true" className="size-5" />
        Sample case loaded
      </div>
      <h1 className="mt-4 max-w-[24ch] text-3xl font-bold leading-[1.08] tracking-[-0.035em] text-balance sm:text-4xl">
        Elena Rivera’s sample application is ready.
      </h1>
      <p className="mt-4 max-w-[42rem] leading-relaxed text-muted">
        Her saved answers can fill the SSDI forms. Local file searches remain
        live and are never supplied by this sample case.
      </p>
      <Button className="mt-7" onClick={onContinue}>
        Continue to documents
      </Button>
    </div>
  );
}

function Preparation({
  locale,
  readiness,
  showIntroduction,
}: {
  locale: SupportedLocale;
  readiness: ReturnType<
    typeof useApplicantCase
  >["applicantCase"]["documentReadiness"];
  showIntroduction: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-bold text-primary">
        {localized(copy.preparing, locale)}
      </p>
      <h1 className="mt-3 max-w-[32ch] text-2xl font-bold leading-tight tracking-[-0.025em] text-balance sm:text-3xl">
        {localized(copy.readyPrompt, locale)}
      </h1>
      {showIntroduction ? (
        <p className="mt-4 max-w-[65ch] text-sm leading-relaxed text-muted">
          {localized(copy.introduction, locale)}
        </p>
      ) : null}
      <ul className="mt-6 flex flex-wrap gap-2.5">
        {preparationItems.map((item) => (
          <li
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-sm font-bold",
              readiness[item.id] === "follow_up"
                ? "border-warning/30 bg-warning-soft text-warning"
                : readiness[item.id] === "ready" ||
                    readiness[item.id] === "obtained"
                  ? "border-success/20 bg-success-soft text-success"
                  : "border-border bg-surface-subtle",
            )}
            key={item.id}
          >
            {readiness[item.id] === "follow_up" ? (
              <CircleAlert aria-hidden="true" className="size-3.5" />
            ) : (
              <Check
                aria-hidden="true"
                className={cn(
                  "size-3.5",
                  !readiness[item.id] && "text-muted",
                )}
              />
            )}
            {localized(item.label, locale)}
            {readiness[item.id] === "follow_up" ? (
              <span className="text-xs">
                {locale === "es-US"
                  ? "Buscar después"
                  : locale === "zh-CN"
                    ? "稍后补充"
                    : "Find later"}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function VoiceState({
  locale,
  state,
  status,
}: {
  locale: SupportedLocale;
  state: ReturnType<typeof useVoiceTurn>["state"];
  status: ConversationStatus;
}) {
  const englishLabel =
    state === "listening"
      ? "Listening"
      : state === "speaking"
        ? "Speaking"
        : state === "processing" || status === "extracting"
          ? "Checking your answer"
          : state === "error" || status === "error"
            ? "Listening paused"
          : status === "paused"
            ? "Paused"
            : "Ready";
  const label =
    locale === "en-US"
      ? englishLabel
      : voiceStateTranslation(englishLabel, locale);
  return (
    <p
      aria-live="polite"
      className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-border bg-surface/95 px-3.5 py-1.5 text-xs font-bold shadow-sm"
    >
      {label}
    </p>
  );
}

function voiceStateTranslation(
  state: string,
  locale: Exclude<SupportedLocale, "en-US">,
) {
  const translations: Record<string, Record<typeof locale, string>> = {
    Listening: { "es-US": "Escuchando", "zh-CN": "正在聆听" },
    Speaking: { "es-US": "Hablando", "zh-CN": "正在朗读" },
    "Checking your answer": {
      "es-US": "Revisando su respuesta",
      "zh-CN": "正在核对您的回答",
    },
    "Listening paused": {
      "es-US": "Escucha en pausa",
      "zh-CN": "聆听已暂停",
    },
    Paused: { "es-US": "En pausa", "zh-CN": "已暂停" },
    Ready: { "es-US": "Listo", "zh-CN": "准备就绪" },
  };
  return translations[state]?.[locale] ?? state;
}

function ConversationControls({
  locale,
  onFinish,
  onPause,
  onRepeat,
  onType,
  showTypeAction,
  state,
}: {
  locale: SupportedLocale;
  onFinish: () => void;
  onPause: () => void;
  onRepeat: () => void;
  onType: () => void;
  showTypeAction: boolean;
  state: ReturnType<typeof useVoiceTurn>["state"];
}) {
  return (
    <div className="mt-7 flex flex-wrap items-center gap-2 border-t border-border pt-5">
      {state === "listening" ? (
        <Button onClick={onFinish}>
          <Check aria-hidden="true" className="size-4" />
          {locale === "es-US"
            ? "Terminé de responder"
            : locale === "zh-CN"
              ? "回答完毕"
              : "I’m done speaking"}
        </Button>
      ) : null}
      {state === "listening" || state === "paused" ? (
        <Button onClick={onPause} variant="secondary">
          {state === "paused" ? (
            <Mic aria-hidden="true" className="size-4" />
          ) : (
            <Pause aria-hidden="true" className="size-4" />
          )}
          {state === "paused"
            ? locale === "es-US"
              ? "Continuar"
              : locale === "zh-CN"
                ? "继续"
                : "Continue"
            : locale === "es-US"
              ? "Pausa"
              : locale === "zh-CN"
                ? "暂停"
                : "Pause"}
        </Button>
      ) : null}
      <Button onClick={onRepeat} size="small" variant="quiet">
        <Volume2 aria-hidden="true" className="size-4" />
        {locale === "es-US"
          ? "Repetir"
          : locale === "zh-CN"
            ? "重复"
            : "Repeat"}
      </Button>
      {showTypeAction ? (
        <Button onClick={onType} size="small" variant="quiet">
          <Keyboard aria-hidden="true" className="size-4" />
          {localized(copy.typeAnswer, locale)}
        </Button>
      ) : null}
    </div>
  );
}

function TypedAnswer({
  locale,
  onChange,
  onSubmit,
  value,
}: {
  locale: SupportedLocale;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  value: string;
}) {
  return (
    <form className="mt-6" onSubmit={onSubmit}>
      <label className="text-sm font-bold" htmlFor="typed-answer">
        {localized(copy.yourAnswer, locale)}
      </label>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row">
        <textarea
          autoFocus
          className="min-h-24 flex-1 resize-y rounded-[var(--radius-control)] border border-border bg-surface px-4 py-3 leading-relaxed placeholder:text-muted"
          id="typed-answer"
          onChange={(event) => onChange(event.target.value)}
          required
          value={value}
        />
        <Button className="self-end" type="submit">
          <Send aria-hidden="true" className="size-4" />
          {localized(copy.sendAnswer, locale)}
        </Button>
      </div>
    </form>
  );
}

function ReviewIssues({
  completion,
  locale,
  onResolve,
}: {
  completion: CompletionResult;
  locale: SupportedLocale;
  onResolve: (questionId: string) => void;
}) {
  const issues = completion.blocking.filter(
    (issue) => issue.id !== "final-review",
  );
  return (
    <div>
      <p className="text-sm font-bold text-primary">
        {locale === "es-US"
          ? "Revisión"
          : locale === "zh-CN"
            ? "核对"
            : "Review"}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-0.035em] text-balance">
        {issues.length
          ? unresolvedMessage(issues.length, locale)
          : localized(copy.allQuestionsAnswered, locale)}
      </h1>
      <ul className="mt-6 divide-y divide-border border-y border-border">
        {issues.map((issue) => (
          <li
            className="flex items-center justify-between gap-4 py-4"
            key={issue.id}
          >
            <span className="font-bold">{issue.message}</span>
            {issue.questionId ? (
              <Button
                onClick={() => onResolve(issue.questionId!)}
                size="small"
                variant="secondary"
              >
                {locale === "es-US"
                  ? "Resolver"
                  : locale === "zh-CN"
                    ? "处理"
                    : "Resolve"}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContextPanel({
  applicantCase,
  locale,
}: {
  applicantCase: ReturnType<typeof useApplicantCase>["applicantCase"];
  locale: SupportedLocale;
}) {
  const recentTurns = applicantCase.interviewTurns.slice(-4).reverse();
  const confirmedFacts = [
    applicantCase.applicant.legalName.value,
    applicantCase.applicant.phone.value,
    applicantCase.conditions[0]?.name.value,
    applicantCase.education.highestLevel.value,
  ].filter(Boolean);
  return (
    <aside className="min-w-0 lg:sticky lg:top-20 lg:h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:border-l lg:border-border lg:pl-7 lg:pt-2">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">
          {locale === "es-US"
            ? "Datos confirmados"
            : locale === "zh-CN"
              ? "已确认资料"
              : "Confirmed facts"}
        </h2>
        <CheckCircle2 aria-hidden="true" className="size-5 text-success" />
      </div>
      {confirmedFacts.length ? (
        <ul className="mt-4 divide-y divide-border border-y border-border">
          {confirmedFacts.map((fact) => (
            <li className="py-3 text-sm font-bold" key={String(fact)}>
              {String(fact)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted">
          {locale === "es-US"
            ? "Los datos aparecerán después de que confirme cada respuesta."
            : locale === "zh-CN"
              ? "每次确认回答后，资料会显示在这里。"
              : "Facts appear here after each answer is confirmed."}
        </p>
      )}

      {recentTurns.length ? (
        <details className="mt-6 rounded-[var(--radius-control)] border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between px-3.5 text-sm font-bold">
            {locale === "es-US"
              ? "Transcripción reciente"
              : locale === "zh-CN"
                ? "最近对话记录"
                : "Recent transcript"}
            <RotateCcw aria-hidden="true" className="size-3.5 text-muted" />
          </summary>
          <ol className="border-t border-border px-3.5 py-2">
            {recentTurns.map((turn) => (
              <li className="py-2 text-sm leading-relaxed" key={turn.id}>
                {turn.transcript}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </aside>
  );
}

function LanguageMenu({
  locale,
  onChange,
}: {
  locale: SupportedLocale;
  onChange: (locale: SupportedLocale) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm font-bold">
      <span className="sr-only">Conversation language</span>
      <select
        className="min-h-11 rounded-[var(--radius-control)] border border-border bg-surface px-3"
        onChange={(event) =>
          onChange(event.target.value as SupportedLocale)
        }
        value={locale}
      >
        {SUPPORTED_LOCALES.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function isCollectionQuestion(
  question: QuestionDefinition,
): question is QuestionDefinition & {
  answerKind: "providers" | "medications" | "jobs" | "marriages" | "children";
} {
  return [
    "providers",
    "medications",
    "jobs",
    "marriages",
    "children",
  ].includes(question.answerKind);
}

function singularCollectionKind(
  collection: "providers" | "medications" | "jobs" | "marriages" | "children",
) {
  return {
    providers: "provider",
    medications: "medication",
    jobs: "job",
    marriages: "marriage",
    children: "child",
  }[collection];
}

function REDACTED(
  extraction: InterviewExtraction,
  field: InterviewExtraction["facts"][number]["field"],
) {
  return extraction.facts.find((fact) => fact.field === field)?.value ?? null;
}

function buildCommitActions({
  directActions,
  extraction,
  source,
  turnId,
}: {
  directActions: CaseAction[];
  extraction: InterviewExtraction | null;
  source: PendingAnswer["source"];
  turnId: string;
}) {
  const actions: CaseAction[] = [];
  if (extraction) {
    const entityCounts = new Map<string, number>();
    applyInterviewExtraction(
      (action) => {
        actions.push(action);
      },
      extraction,
      turnId,
      {
        confirmed: true,
        source,
        createId: (prefix) => {
          const next = (entityCounts.get(prefix) ?? 0) + 1;
          entityCounts.set(prefix, next);
          return `${prefix}-${turnId}-${next}`;
        },
      },
    );
  }
  actions.push(...directActions);
  return actions;
}

function nextQuestionForCase(
  applicantCase: Parameters<typeof nextQuestion>[0],
) {
  return (
    QUESTION_REGISTRY.find(
      (candidate) =>
        candidate.isActive(applicantCase) &&
        !candidate.isAnswered(applicantCase) &&
        !applicantCase.deferredItems.some(
          (item) => item.questionId === candidate.id,
        ),
    ) ?? null
  );
}

function processingAcknowledgement(
  question: QuestionDefinition,
  locale: SupportedLocale,
) {
  const variants: Record<SupportedLocale, readonly string[]> = {
    "en-US": [
      "Okay, one moment.",
      "Got it, let me make sure I heard you.",
      "All right, give me a second.",
    ],
    "es-US": [
      "Bien, un momento.",
      "Entendido, déjeme comprobar que le escuché bien.",
      "De acuerdo, deme un segundo.",
    ],
    "zh-CN": [
      "好的，请稍等。",
      "明白了，让我确认一下是否听对了。",
      "好的，请给我一点时间。",
    ],
  };
  const questionIndex = Math.max(
    0,
    QUESTION_REGISTRY.findIndex((candidate) => candidate.id === question.id),
  );
  const localizedVariants = variants[locale];
  return localizedVariants[questionIndex % localizedVariants.length];
}

function explicitConfirmationPrompt(
  answer: PendingAnswer,
  locale: SupportedLocale,
) {
  const legalName =
    answer.question.id === "legal-name" &&
    answer.extraction?.facts.length === 1
      ? REDACTED(answer.extraction, "applicant.legalName")
      : null;
  if (legalName) {
    return {
      "en-US": `I heard your full legal name as ${legalName}. Is that exactly right?`,
      "es-US": `Escuché su nombre legal completo como ${legalName}. ¿Es exactamente correcto?`,
      "zh-CN": `我听到您的法定全名是${legalName}。完全正确吗？`,
    }[locale];
  }
  if (answer.question.answerKind === "yes_no" && !answer.extraction) {
    return {
      "en-US": `Okay, I’m going to put that down as ${answer.summary}. Is that right?`,
      "es-US": `De acuerdo, voy a anotar ${answer.summary}. ¿Es correcto?`,
      "zh-CN": `好的，我会记录为${answer.summary}。这样对吗？`,
    }[locale];
  }
  const readback = answer.extraction?.confirmationText?.trim();
  if (readback) {
    if (
      (readback.endsWith("?") || readback.endsWith("？")) &&
      isConfirmationQuestion(readback, locale)
    ) {
      return readback;
    }
    if (readback.endsWith("?") || readback.endsWith("？")) {
      return confirmationPrompt(answer.summary, locale);
    }
    return {
      "en-US": `${readback} Is that exactly right?`,
      "es-US": `${readback} ¿Es exactamente correcto?`,
      "zh-CN": `${readback} 这样完全正确吗？`,
    }[locale];
  }
  return confirmationPrompt(answer.summary, locale);
}

function isConfirmationQuestion(
  value: string,
  locale: SupportedLocale,
) {
  return {
    "en-US":
      /\b(?:is that|is this|did i hear|do i have|right|correct|exactly)\b/i,
    "es-US":
      /(?:¿?es (?:eso|esto|así)|correct[oa]|verdad|entendí bien|exactamente)/i,
    "zh-CN": /(?:对吗|正确吗|是吗|没错吗|完全正确吗)/,
  }[locale].test(value);
}

function confirmationBridge(
  nextPrompt: string,
  locale: SupportedLocale,
) {
  return {
    "en-US": `Thank you, I have that. ${nextPrompt}`,
    "es-US": `Gracias, ya lo tengo. ${nextPrompt}`,
    "zh-CN": `谢谢，我记下了。${nextPrompt}`,
  }[locale];
}

function confirmationAccepted(locale: SupportedLocale) {
  return {
    "en-US": "Thank you, I have that.",
    "es-US": "Gracias, ya lo tengo.",
    "zh-CN": "谢谢，我记下了。",
  }[locale];
}

function collectionContinuationPrompt(
  question: QuestionDefinition,
  locale: SupportedLocale,
) {
  const prompts: Record<
    Extract<
      QuestionDefinition["answerKind"],
      "providers" | "medications" | "jobs" | "marriages" | "children"
    >,
    Record<SupportedLocale, string>
  > = {
    providers: {
      "en-US":
        "Who else treated you? If that was everyone, just tell me the list is complete.",
      "es-US":
        "¿Quién más le atendió? Si no hay nadie más, dígame que la lista está completa.",
      "zh-CN": "还有谁为您治疗过？如果没有其他人，请告诉我名单已经完整。",
    },
    medications: {
      "en-US":
        "What other medicine do you take for these conditions? Tell me when that is the full list.",
      "es-US":
        "¿Qué otro medicamento toma para estas condiciones? Dígame cuando la lista esté completa.",
      "zh-CN": "您还服用哪些相关药物？清单完整时请告诉我。",
    },
    jobs: {
      "en-US":
        "What other job did you have during those five years? Tell me when that is the full list.",
      "es-US":
        "¿Qué otro trabajo tuvo durante esos cinco años? Dígame cuando la lista esté completa.",
      "zh-CN": "那五年里您还做过什么工作？清单完整时请告诉我。",
    },
    marriages: {
      "en-US":
        "Was there another current or former marriage? Tell me when that is the full list.",
      "es-US":
        "¿Hubo otro matrimonio actual o anterior? Dígame cuando la lista esté completa.",
      "zh-CN": "还有其他目前或过去的婚姻吗？清单完整时请告诉我。",
    },
    children: {
      "en-US":
        "Is there another child I should include? Tell me when that is the full list.",
      "es-US":
        "¿Hay otro hijo que deba incluir? Dígame cuando la lista esté completa.",
      "zh-CN": "还有其他需要列入的子女吗？清单完整时请告诉我。",
    },
  };
  return prompts[question.answerKind as keyof typeof prompts][locale];
}

function contextualCorrection(
  transcript: string,
  locale: SupportedLocale,
): { isCorrection: boolean; replacement: string | null } {
  const correctionPatterns: Record<SupportedLocale, RegExp> = {
    "en-US":
      /(?:don['’]?t|do not) save|(?:that(?:'s| is)|you(?:'re| are)) (?:wrong|not right)|\bi meant\b|change (?:that|my last answer)|correct (?:that|my last answer)|disregard that|ignore that/i,
    "es-US":
      /no (?:lo )?guarde|eso est[aá] mal|no es correcto|quise decir|cambie (?:eso|mi respuesta)|corrija (?:eso|mi respuesta)|ignore eso/i,
    "zh-CN":
      /不要保存|别保存|刚才.*(?:不对|错)|你听错了|我的意思是|修改刚才|更正刚才|忽略刚才/,
  };
  if (!correctionPatterns[locale].test(transcript)) {
    return { isCorrection: false, replacement: null };
  }

  const rejectedReplacement = correctionFromRejection(
    transcript,
    locale,
  );
  if (rejectedReplacement) {
    return { isCorrection: true, replacement: rejectedReplacement };
  }

  const replacementPatterns: Record<SupportedLocale, RegExp> = {
    "en-US":
      /^(?:.*?)(?:i meant|it should be|the correct answer is|change (?:that|it) to)\s+(.+)$/i,
    "es-US":
      /^(?:.*?)(?:quise decir|debe ser|la respuesta correcta es|cambie (?:eso|lo) a)\s+(.+)$/i,
    "zh-CN": /^(?:.*?)(?:我的意思是|应该是|正确答案是|改成)\s*(.+)$/,
  };
  const replacement =
    transcript.match(replacementPatterns[locale])?.[1]?.trim() ?? null;
  return { isCorrection: true, replacement };
}

function hasConversationalDetail(
  transcript: string,
  locale: SupportedLocale,
) {
  const normalized = transcript.trim();
  if (locale === "zh-CN") return normalized.length > 6;
  return normalized.split(/\s+/).length > 4;
}

function correctionTargetPrompt(
  question: QuestionDefinition,
  locale: SupportedLocale,
) {
  const target = localized(question.prompt, locale);
  return {
    "en-US": `Do you want to replace your answer to: ${target}`,
    "es-US": `¿Quiere reemplazar su respuesta a: ${target}`,
    "zh-CN": `您要修改这个问题的回答吗：${target}`,
  }[locale];
}

function statusMessage(
  result: CompletionResult,
  locale: SupportedLocale,
) {
  return {
    "en-US": `${result.answered} of ${result.total} sections are complete. ${result.blocking.length} items still need attention.`,
    "es-US": `${result.answered} de ${result.total} secciones están completas. ${result.blocking.length} elementos aún necesitan atención.`,
    "zh-CN": `已完成 ${result.answered} 项，共 ${result.total} 项。还有 ${result.blocking.length} 项需要处理。`,
  }[locale];
}

function unresolvedMessage(count: number, locale: SupportedLocale) {
  return {
    "en-US": `${count} ${count === 1 ? "answer needs" : "answers need"} your attention before the documents can be created.`,
    "es-US": `${count} ${count === 1 ? "respuesta necesita" : "respuestas necesitan"} su atención antes de crear los documentos.`,
    "zh-CN": `生成文件前，还有 ${count} 项回答需要处理。`,
  }[locale];
}

function finalReviewPrompt(locale: SupportedLocale) {
  return {
    "en-US":
      "You have answered every required question. Are these answers complete and ready to use in your documents?",
    "es-US":
      "Ha respondido todas las preguntas necesarias. ¿Están completas y listas para usarse en sus documentos?",
    "zh-CN": "所有必答问题都已完成。您确认这些回答完整并可用于生成文件吗？",
  }[locale];
}

function finalReadyMessage(locale: SupportedLocale) {
  return {
    "en-US": "Your answers are ready. I’m opening your documents.",
    "es-US": "Sus respuestas están listas. Abriré sus documentos.",
    "zh-CN": "您的回答已准备好。现在打开文件页面。",
  }[locale];
}

function incompleteMessage(locale: SupportedLocale) {
  return {
    "en-US": "Some required answers still need attention.",
    "es-US": "Algunas respuestas necesarias aún requieren atención.",
    "zh-CN": "还有一些必答内容需要处理。",
  }[locale];
}

function commandUnavailableHere(locale: SupportedLocale) {
  return {
    "en-US": "That action is available in Documents or Records.",
    "es-US": "Esa acción está disponible en Documentos o Expedientes.",
    "zh-CN": "该操作可在文件或医疗记录页面中使用。",
  }[locale];
}

function microphoneUnavailable(locale: SupportedLocale) {
  return {
    "en-US": "The microphone is unavailable. Type your answer below.",
    "es-US":
      "El micrófono no está disponible. Escriba su respuesta a continuación.",
    "zh-CN": "麦克风不可用。请在下方输入您的回答。",
  }[locale];
}

function listeningAgain(locale: SupportedLocale) {
  return {
    "en-US": "I didn’t catch that. I’m still listening.",
    "es-US": "No entendí eso. Sigo escuchando.",
    "zh-CN": "我没有听清。我还在继续听。",
  }[locale];
}

function isMicrophoneUnavailableError(error: unknown) {
  if (error instanceof DOMException) {
    return [
      "AbortError",
      "NotAllowedError",
      "NotFoundError",
      "NotReadableError",
      "SecurityError",
    ].includes(error.name);
  }
  const message = error instanceof Error ? error.message : String(error);
  return /microphone access|permission denied|requested device not found|voice recording is not supported|could not start audio source/i.test(
    message,
  );
}

function answerProcessingFailed(locale: SupportedLocale) {
  return {
    "en-US": "Your answer was kept, but it could not be processed.",
    "es-US": "Su respuesta se conservó, pero no se pudo procesar.",
    "zh-CN": "您的回答已保留，但暂时无法处理。",
  }[locale];
}

function readinessNoted(locale: SupportedLocale) {
  return {
    "en-US":
      "I noted what you need to find. We can continue and return to it later. Say “I’m ready” when you want to begin.",
    "es-US":
      "Anoté lo que necesita buscar. Podemos continuar y volver a ello después. Diga “Estoy listo” o “Estoy lista” cuando quiera comenzar.",
    "zh-CN":
      "我已记录需要补充的资料。我们可以继续，稍后再处理。准备好后，请说“我准备好了”。",
  }[locale];
}

function documentTerms(
  id: string,
): Record<SupportedLocale, readonly string[]> {
  const terms: Record<
    string,
    Record<SupportedLocale, readonly string[]>
  > = {
    ssn: {
      "en-US": ["social security", "ssn"],
      "es-US": ["seguro social"],
      "zh-CN": ["社会安全", "社保号码"],
    },
    "birth-certificate": {
      "en-US": ["birth certificate", "proof of birth"],
      "es-US": ["acta de nacimiento", "comprobante de nacimiento"],
      "zh-CN": ["出生证明"],
    },
    "photo-id": {
      "en-US": ["photo id", "driver license", "passport"],
      "es-US": ["identificación", "licencia", "pasaporte"],
      "zh-CN": ["身份证", "驾照", "护照"],
    },
    "work-history": {
      "en-US": ["work history", "job history"],
      "es-US": ["historial de trabajo", "historial laboral"],
      "zh-CN": ["工作经历"],
    },
    "medical-providers": {
      "en-US": ["doctor", "provider", "clinic", "hospital"],
      "es-US": ["médico", "proveedor", "clínica", "hospital"],
      "zh-CN": ["医生", "诊所", "医院", "医疗机构"],
    },
    medications: {
      "en-US": ["medication", "medicine"],
      "es-US": ["medicamento", "medicina"],
      "zh-CN": ["药物", "药品"],
    },
    banking: {
      "en-US": ["bank", "routing", "account"],
      "es-US": ["banco", "cuenta bancaria"],
      "zh-CN": ["银行", "账户"],
    },
  };
  return (
    terms[id] ?? {
      "en-US": [],
      "es-US": [],
      "zh-CN": [],
    }
  );
}
