"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { SupportedLocale } from "@/lib/case/types";
import {
  createGuavaVoiceSession,
  type GuavaSessionCallbacks,
  type GuavaSessionConfig,
  type GuavaUtterance,
  type GuavaVoiceSession,
} from "@/lib/voice/guava-webrtc";

/**
 * Guava-powered voice turns for SSDI Agent.
 *
 * Speech-to-text and text-to-speech are both Guava: the browser holds one
 * Guava WebRTC call, Guava transcribes the applicant's uplink, and Guava's
 * own voice speaks on the downlink. The exported shape is unchanged from the
 * previous provider so every consuming flow compiles as-is.
 *
 * One honest caveat about `speak()`. Guava has no browser primitive that says
 * "read this exact string aloud" -- the deployed Guava agent owns its own
 * wording. The closest supported surface is the WebRTC chat side-channel's
 * `{ type: "user-text" }` message, which injects text into the live call and
 * lets the agent respond in speech. So `speak(prompt)` hands the prompt to the
 * Guava agent and resolves once Guava's spoken reply has settled. Wording may
 * therefore be paraphrased by the agent rather than read verbatim.
 */

export type VoiceTurnState =
  | "idle"
  | "requesting"
  | "speaking"
  | "listening"
  | "paused"
  | "processing"
  | "error";

type PendingListen = {
  reject: (error: Error) => void;
  resolve: (transcript: string) => void;
};

type VoiceSessionFactory = (
  config: GuavaSessionConfig,
  callbacks: GuavaSessionCallbacks,
) => GuavaVoiceSession;

declare global {
  interface Window {
    __SSDI_E2E_GUAVA_FACTORY__?: VoiceSessionFactory;
  }
}

/** Silence after Guava's last transcript fragment that finalises an answer. */
const CALLER_SETTLE_MS = 1_400;
/** Silence after Guava's last spoken fragment that ends a `speak()` turn. */
const AGENT_SETTLE_MS = 1_000;

const LOCALE_NAMES: Record<SupportedLocale, string> = {
  "en-US": "English",
  "es-US": "Spanish",
  "zh-CN": "Mandarin Chinese",
};

export function useVoiceTurn(locale: SupportedLocale = "en-US") {
  const [state, setState] = useState<VoiceTurnState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const [level, setLevel] = useState(0);

  const sessionRef = useRef<GuavaVoiceSession | null>(null);
  const connectPromiseRef = useRef<Promise<void> | null>(null);
  const activeRef = useRef(false);
  const pendingListenRef = useRef<PendingListen | null>(null);
  const partialTranscriptRef = useRef("");
  const callerUtteranceRef = useRef<string | null>(null);
  const callerTimerRef = useRef<number | null>(null);
  const speechCompletionRef = useRef<(() => void) | null>(null);
  const speechTimeoutRef = useRef<number | null>(null);
  const agentTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const localeRef = useRef(locale);

  localeRef.current = locale;

  const clearAgentTimer = useCallback(() => {
    if (agentTimerRef.current !== null) {
      window.clearTimeout(agentTimerRef.current);
      agentTimerRef.current = null;
    }
  }, []);

  const clearCallerTimer = useCallback(() => {
    if (callerTimerRef.current !== null) {
      window.clearTimeout(callerTimerRef.current);
      callerTimerRef.current = null;
    }
  }, []);

  const settleSpeech = useCallback(() => {
    clearAgentTimer();
    if (speechTimeoutRef.current !== null) {
      window.clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    speechCompletionRef.current?.();
    speechCompletionRef.current = null;
  }, [clearAgentTimer]);

  const rejectPendingListen = useCallback(
    (message: string) => {
      clearCallerTimer();
      pendingListenRef.current?.reject(new Error(message));
      pendingListenRef.current = null;
      partialTranscriptRef.current = "";
      callerUtteranceRef.current = null;
    },
    [clearCallerTimer],
  );

  /** Resolve the in-flight `listen()` with whatever Guava has transcribed. */
  const resolveListen = useCallback(() => {
    clearCallerTimer();
    const pending = pendingListenRef.current;
    if (!pending) return;
    const transcript = partialTranscriptRef.current.trim();
    if (!transcript) return;

    pendingListenRef.current = null;
    partialTranscriptRef.current = "";
    callerUtteranceRef.current = null;
    sessionRef.current?.setMuted(true);
    setLevel(0);
    setLastTranscript(transcript);
    if (mountedRef.current) setState("processing");
    pending.resolve(transcript);
    window.dispatchEvent(
      new CustomEvent("ssdi:voice-transcript", {
        detail: { locale: localeRef.current, transcript },
      }),
    );
  }, [clearCallerTimer]);

  const activate = useCallback(async () => {
    setError(null);
    if (activeRef.current) return;
    if (connectPromiseRef.current) return connectPromiseRef.current;

    const connect = async () => {
      setState("requesting");

      // The `grtc-` code is minted server-side; GUAVA_API_KEY never reaches
      // the browser.
      const response = await fetch("/api/voice/session", {
        cache: "no-store",
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | (GuavaSessionConfig & { error?: string })
        | null;
      if (!response.ok || !payload?.webrtcCode) {
        throw new Error(
          payload?.error ??
            "Voice is not configured. Add a Guava API key to enable spoken questions.",
        );
      }
      if (!mountedRef.current) return;

      const factory =
        typeof window !== "undefined" &&
        /^(?:127\.0\.0\.1|localhost)$/.test(window.location.hostname)
          ? window.__SSDI_E2E_GUAVA_FACTORY__
          : undefined;
      const create = factory ?? createGuavaVoiceSession;

      const session = create(
        {
          chatUrl: payload.chatUrl,
          socketUrl: payload.socketUrl,
          webrtcCode: payload.webrtcCode,
        },
        {
          onAgentSpeech: (utterance: GuavaUtterance) => {
            window.dispatchEvent(
              new CustomEvent("ssdi:voice-message", { detail: utterance }),
            );
            if (mountedRef.current && speechCompletionRef.current) {
              setState("speaking");
            }
            // Guava streams an utterance in fragments. Treat a gap in the
            // stream as "the agent stopped talking".
            clearAgentTimer();
            agentTimerRef.current = window.setTimeout(
              settleSpeech,
              AGENT_SETTLE_MS,
            );
            // The applicant answering is what ends a listening turn; an agent
            // utterance arriving mid-listen means Guava moved on, so commit
            // whatever we heard.
            if (pendingListenRef.current) resolveListen();
          },
          onCallerSpeech: (utterance: GuavaUtterance) => {
            if (!pendingListenRef.current) return;
            // Fragments of the same utterance replace; a new utterance id
            // appends, matching how the Guava widget renders its transcript.
            if (
              callerUtteranceRef.current &&
              utterance.id &&
              utterance.id !== callerUtteranceRef.current
            ) {
              partialTranscriptRef.current =
                `${partialTranscriptRef.current} ${utterance.text}`.trim();
            } else {
              partialTranscriptRef.current = utterance.text;
            }
            if (utterance.id) callerUtteranceRef.current = utterance.id;
            clearCallerTimer();
            callerTimerRef.current = window.setTimeout(
              resolveListen,
              CALLER_SETTLE_MS,
            );
          },
          onConnected: () => {
            activeRef.current = true;
            session.setMuted(true);
            if (mountedRef.current) setState("idle");
          },
          onEnded: () => {
            activeRef.current = false;
            settleSpeech();
            rejectPendingListen(
              "The voice session ended. Start voice again to continue.",
            );
            setLevel(0);
            if (mountedRef.current) setState("idle");
          },
          onError: (message: string) => {
            activeRef.current = false;
            settleSpeech();
            rejectPendingListen(message);
            setLevel(0);
            if (!mountedRef.current) return;
            setError(message);
            setState("error");
          },
          onLevel: (next: number) => {
            if (mountedRef.current) setLevel(Math.min(1, Math.max(0, next)));
          },
        },
      );

      sessionRef.current = session;
      await session.connect();
      if (!mountedRef.current) {
        session.close();
        return;
      }
      activeRef.current = true;
      session.setMuted(true);
      setState("idle");

      // Guava has no system-message channel from the browser, so the language
      // hint rides the same text side-channel the applicant's typed answers
      // use. English, Spanish and Mandarin all stay supported.
      session.sendText(
        `[SSDI Agent interface] The applicant's language is ${
          LOCALE_NAMES[localeRef.current] ?? localeRef.current
        } (${localeRef.current}). The interface asks one guided question at a time and validates each answer, so wait for the next prompt instead of continuing on your own.`,
      );
    };

    connectPromiseRef.current = connect()
      .catch((problem: unknown) => {
        const message = voiceErrorMessage(problem);
        setError(message);
        setState("error");
        throw problem instanceof Error ? problem : new Error(message);
      })
      .finally(() => {
        connectPromiseRef.current = null;
      });
    return connectPromiseRef.current;
  }, [
    clearAgentTimer,
    clearCallerTimer,
    rejectPendingListen,
    resolveListen,
    settleSpeech,
  ]);

  const skipSpeech = useCallback(() => {
    sessionRef.current?.setMuted(true);
    settleSpeech();
    setError(null);
    setState("idle");
  }, [settleSpeech]);

  const cancel = useCallback(() => {
    skipSpeech();
    rejectPendingListen("Listening stopped.");
    setLevel(0);
    const session = sessionRef.current;
    sessionRef.current = null;
    activeRef.current = false;
    session?.close();
  }, [rejectPendingListen, skipSpeech]);

  const speak = useCallback(
    async (text: string) => {
      await activate();
      const session = sessionRef.current;
      if (!session || !activeRef.current) {
        throw new Error("The Guava voice session is not ready.");
      }

      settleSpeech();
      setError(null);
      setState("speaking");
      // Mute the applicant while Guava talks so the uplink does not transcribe
      // the agent's own voice back as an answer.
      session.setMuted(true);

      await new Promise<void>((resolve) => {
        speechCompletionRef.current = resolve;
        speechTimeoutRef.current = window.setTimeout(
          settleSpeech,
          Math.max(8_000, text.length * 120),
        );
        session.sendText(text);
      });

      if (mountedRef.current) setState("idle");
    },
    [activate, settleSpeech],
  );

  const listen = useCallback(async (): Promise<string> => {
    await activate();
    const session = sessionRef.current;
    if (!session || !activeRef.current) {
      throw new Error("The Guava voice session is not ready.");
    }

    rejectPendingListen("A new listening turn started.");
    setError(null);
    partialTranscriptRef.current = "";
    callerUtteranceRef.current = null;
    session.setMuted(false);
    setState("listening");

    return new Promise<string>((resolve, reject) => {
      pendingListenRef.current = { reject, resolve };
    }).finally(() => {
      if (mountedRef.current) setState("idle");
    });
  }, [activate, rejectPendingListen]);

  const finishAnswer = useCallback(() => {
    clearCallerTimer();
    const transcript = partialTranscriptRef.current.trim();
    const pending = pendingListenRef.current;
    if (!pending) return;

    sessionRef.current?.setMuted(true);
    setLevel(0);
    if (!transcript) {
      const message = "We could not hear a clear answer. Try again or type it.";
      pendingListenRef.current = null;
      callerUtteranceRef.current = null;
      setError(message);
      setState("error");
      pending.reject(new Error(message));
      return;
    }
    pendingListenRef.current = null;
    partialTranscriptRef.current = "";
    callerUtteranceRef.current = null;
    setLastTranscript(transcript);
    setState("processing");
    pending.resolve(transcript);
  }, [clearCallerTimer]);

  const pause = useCallback(() => {
    if (!pendingListenRef.current) return;
    clearCallerTimer();
    sessionRef.current?.setMuted(true);
    setLevel(0);
    setState("paused");
  }, [clearCallerTimer]);

  const resume = useCallback(() => {
    if (!pendingListenRef.current) return;
    sessionRef.current?.setMuted(false);
    setState("listening");
  }, []);

  const ask = useCallback(
    async (prompt: string) => {
      await speak(prompt);
      return listen();
    },
    [listen, speak],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      settleSpeech();
      rejectPendingListen("Voice session closed.");
      const session = sessionRef.current;
      sessionRef.current = null;
      activeRef.current = false;
      session?.close();
    };
  }, [rejectPendingListen, settleSpeech]);

  return {
    activate,
    ask,
    cancel,
    error,
    finishAnswer,
    lastTranscript,
    level,
    listen,
    pause,
    resume,
    skipSpeech,
    speak,
    state,
  };
}

function voiceErrorMessage(problem: unknown) {
  if (problem instanceof Error && problem.message) return problem.message;
  if (typeof problem === "string" && problem) return problem;
  if (problem && typeof problem === "object") {
    const candidate = problem as {
      error?: { message?: string };
      message?: string;
    };
    return (
      candidate.error?.message ??
      candidate.message ??
      "The Guava voice session failed. Please try again."
    );
  }
  return "The Guava voice session failed. Please try again.";
}
