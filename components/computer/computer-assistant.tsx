"use client";

import {
  Check,
  ChevronDown,
  ExternalLink,
  FileSearch,
  Image as ImageIcon,
  LoaderCircle,
  Mic,
  MonitorCheck,
  Search,
  Square,
  Unplug,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useVoiceTurn } from "@/components/voice/use-voice-turn";
import type { SupportedLocale } from "@/lib/case/types";
import { requestComputerTurn, serializeToolResult } from "@/lib/computer/client";
import type {
  ActivityEvent,
  CandidateFile,
  ComputerEnvironment,
  ComputerObservation,
  ComputerToolResult,
} from "@/lib/computer/schema";
import { cn } from "@/lib/utils";

const MAX_ACTIONS = 12;
const MAX_RUN_MS = 120_000;

interface AgentStatus {
  message: string;
  step: number;
}

export function ComputerAssistant({ locale }: { locale: SupportedLocale }) {
  const voice = useVoiceTurn(locale);
  const [open, setOpen] = useState(false);
  const [environment, setEnvironment] = useState<ComputerEnvironment | null>(null);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [candidates, setCandidates] = useState<CandidateFile[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [linked, setLinked] = useState<Set<string>>(new Set());
  const [request, setRequest] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [observation, setObservation] = useState<ComputerObservation | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus | null>(null);
  const speechQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mountedRef = useRef(true);
  const runRef = useRef(0);
  const plannerAbortRef = useRef<AbortController | null>(null);

  const connected = Boolean(environment);

  useEffect(() => {
    mountedRef.current = true;
    if (!window.ssdiAgentDesktop) return;
    void Promise.all([
      window.ssdiAgentDesktop.getEnvironment(),
      window.ssdiAgentDesktop.listLinkedCandidates(),
    ])
      .then(([value, linkedFiles]) => {
        if (!mountedRef.current) return;
        setEnvironment(value);
        setLinked(new Set(linkedFiles.map((candidate) => candidate.id)));
      })
      .catch(() => mountedRef.current && setEnvironment(null));
    const unsubscribe = window.ssdiAgentDesktop.onActivity((event) => {
      if (!mountedRef.current) return;
      setActivities((current) => [...current.slice(-19), event]);
      if (event.speak) queueSpeech(event.message);
    });
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
      plannerAbortRef.current?.abort();
      unsubscribe();
    };
    // The native subscription is established once for this mounted control.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function queueSpeech(text: string) {
    speechQueueRef.current = speechQueueRef.current
      .catch(() => undefined)
      .then(() => voice.speak(text))
      .catch(() => undefined);
  }

  function addAssistantActivity(
    phase: ActivityEvent["phase"],
    message: string,
    speak = true,
  ) {
    const activity: ActivityEvent = {
      id: crypto.randomUUID(),
      phase,
      message,
      speak,
      createdAt: new Date().toISOString(),
    };
    setActivities((current) => [...current.slice(-19), activity]);
    if (speak) queueSpeech(message);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await runRequest(request);
  }

  async function captureVoiceRequest() {
    setError(null);
    try {
      await voice.activate();
      addAssistantActivity(
        "started",
        "SSDI Agent will ask the question, then say when it is listening.",
        false,
      );
      const transcript = await voice.ask(voiceRequestPrompt(locale));
      setRequest(transcript);
      await runRequest(transcript);
    } catch (captureError) {
      setError(errorMessage(captureError, "I could not hear the request. Type it instead."));
    }
  }

  async function runRequest(rawRequest: string) {
    const desktop = window.ssdiAgentDesktop;
    const userRequest = rawRequest.trim();
    if (!desktop || !environment) {
      setError("Open this page in SSDI Agent Desktop to control Windows.");
      return;
    }
    if (!userRequest || busy) return;

    const runId = ++runRef.current;
    const plannerAbort = new AbortController();
    plannerAbortRef.current = plannerAbort;
    setBusy(true);
    setError(null);
    setCandidates([]);
    setPreviews({});
    setObservation(null);
    setAgentStatus({ message: "Starting the Windows task.", step: 1 });
    addAssistantActivity("started", `You asked: “${userRequest}”`, false);
    const startedAt = Date.now();
    const history: Array<{ role: "assistant" | "user"; content: string }> = [
      { role: "user", content: userRequest },
    ];
    let toolResult: string | null = null;
    let currentObservation: ComputerObservation | null = null;
    const discovered = new Map<string, CandidateFile>();

    try {
      for (let step = 0; step < MAX_ACTIONS; step += 1) {
        if (Date.now() - startedAt >= MAX_RUN_MS) {
          throw new Error("The Windows task reached its two-minute safety limit. Try a more specific request.");
        }
        setAgentStatus({
          message: "Choosing the next action from Windows accessibility descriptions.",
          step: step + 1,
        });
        const plan = await requestComputerTurn({
          request: userRequest,
          locale,
          environment,
          history: history.slice(-12),
          toolResult,
          observation: currentObservation,
          availableCandidateIds: [...discovered.keys()],
          signal: plannerAbort.signal,
        });
        if (runId !== runRef.current) return;
        history.push({
          role: "assistant",
          content: `${plan.narration}\nState: ${plan.state}${plan.action ? `\nAction: ${JSON.stringify(plan.action)}` : ""}`,
        });

        if (plan.state !== "act" || !plan.action) {
          const selected = plan.candidateIds.length
            ? plan.candidateIds
                .map((id) => discovered.get(id))
                .filter((candidate): candidate is CandidateFile => Boolean(candidate))
            : [];
          setCandidates(selected);
          addAssistantActivity(
            plan.state === "error" ? "failed" : "completed",
            plan.narration,
            true,
          );
          return;
        }

        addAssistantActivity("progress", plan.narration, true);
        setAgentStatus({ message: plan.narration, step: step + 1 });
        const result = await desktop.executeTool(plan.action);
        if (runId !== runRef.current) return;
        collectCandidates(result, discovered);
        if (result.observation) {
          currentObservation = result.observation;
          setObservation(result.observation);
          setAgentStatus({
            message: `Reading accessible controls in ${result.observation.activeWindow.title || "the active window"}.`,
            step: step + 1,
          });
        }
        toolResult = serializeToolResult(result);
        history.push({ role: "user", content: `Native result: ${toolResult}` });
      }
      throw new Error("SSDI Agent stopped after twelve Windows actions. Try a more specific request.");
    } catch (runError) {
      if (runId !== runRef.current) return;
      const message = errorMessage(runError, "SSDI Agent could not complete that Windows task.");
      setError(message);
      addAssistantActivity("failed", message, true);
      setCandidates([...discovered.values()]);
    } finally {
      if (runId === runRef.current) {
        plannerAbortRef.current = null;
        setBusy(false);
        setAgentStatus(null);
      }
    }
  }

  async function stopComputer() {
    runRef.current += 1;
    plannerAbortRef.current?.abort();
    plannerAbortRef.current = null;
    await window.ssdiAgentDesktop?.stopComputer().catch(() => undefined);
    setBusy(false);
    setAgentStatus(null);
    addAssistantActivity("failed", "You stopped the Windows task.", true);
  }

  async function preview(candidate: CandidateFile) {
    if (!window.ssdiAgentDesktop) return;
    setError(null);
    try {
      const result = await window.ssdiAgentDesktop.executeTool({
        tool: "preview_candidate",
        args: { candidateId: candidate.id },
      });
      if (typeof result.previewDataUrl === "string") {
        setPreviews((current) => ({ ...current, [candidate.id]: result.previewDataUrl as string }));
      } else if (result.message) {
        setError(result.message);
      }
    } catch (previewError) {
      setError(errorMessage(previewError, "SSDI Agent could not preview that file."));
    }
  }

  async function openCandidate(candidate: CandidateFile) {
    if (!window.ssdiAgentDesktop) return;
    setError(null);
    try {
      await window.ssdiAgentDesktop.executeTool({
        tool: "open_candidate",
        args: { candidateId: candidate.id },
      });
    } catch (openError) {
      setError(errorMessage(openError, "Windows could not open that file."));
    }
  }

  async function toggleLinked(candidateId: string) {
    if (!window.ssdiAgentDesktop) return;
    const shouldLink = !linked.has(candidateId);
    try {
      await window.ssdiAgentDesktop.linkCandidate({ candidateId, linked: shouldLink });
      setLinked((current) => {
        const next = new Set(current);
        if (shouldLink) next.add(candidateId);
        else next.delete(candidateId);
        return next;
      });
    } catch (linkError) {
      setError(errorMessage(linkError, "SSDI Agent could not add that file to the case."));
    }
  }

  return (
    <div className="fixed bottom-[5.25rem] right-3 z-50 lg:bottom-6 lg:right-6">
      {open ? (
        <section
          aria-label="SSDI Agent computer assistant"
          className="flex max-h-[min(46rem,calc(100dvh-7rem))] w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[var(--radius-surface)] bg-surface shadow-[0_18px_60px_oklch(0_0_0/0.2)] sm:w-[27rem] lg:max-h-[calc(100dvh-3rem)]"
        >
          <header className="flex items-start justify-between gap-4 bg-accent px-5 py-4 text-white">
            <div>
              <p className="flex items-center gap-2 font-bold">
                {connected ? <MonitorCheck aria-hidden="true" className="size-5" /> : <Unplug aria-hidden="true" className="size-5" />}
                Windows assistant
              </p>
              <p className="mt-1 text-sm text-white/80">
                {connected ? "Windows accessibility control ready" : "Available in SSDI Agent Desktop"}
              </p>
            </div>
            <button
              aria-label="Close Windows assistant"
              className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] text-white/80 hover:bg-white/10 hover:text-white"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </header>

          <div className="overflow-y-auto p-4 sm:p-5">
            {!connected ? (
              <p className="rounded-[var(--radius-control)] bg-accent-soft p-4 text-sm leading-relaxed text-accent">
                Open this site inside SSDI Agent Desktop to control Windows apps.
              </p>
            ) : (
              <>
                <form onSubmit={submit}>
                  <label className="text-sm font-bold" htmlFor="computer-request">
                    What should SSDI Agent do on Windows?
                  </label>
                  <div className="mt-2 flex items-stretch gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-background px-3.5 text-base text-foreground placeholder:text-muted/75 focus:border-focus"
                      disabled={busy}
                      id="computer-request"
                      onChange={(event) => setRequest(event.currentTarget.value)}
                      placeholder="Open Explorer and find my passport"
                      value={request}
                    />
                    <Button
                      aria-label={voice.state === "listening" ? "Finish speaking" : "Speak Windows request"}
                      disabled={busy || voice.state === "speaking" || voice.state === "processing"}
                      onClick={() => {
                        if (voice.state === "listening") voice.finishAnswer();
                        else void captureVoiceRequest();
                      }}
                      size="icon"
                      type="button"
                      variant="secondary"
                    >
                      {voice.state === "listening" ? (
                        <Square aria-hidden="true" className="size-4 fill-current" />
                      ) : (
                        <Mic aria-hidden="true" className="size-5" />
                      )}
                    </Button>
                    <Button
                      aria-label="Run Windows request"
                      disabled={busy || !request.trim()}
                      size="icon"
                      type="submit"
                    >
                      {busy ? <LoaderCircle aria-hidden="true" className="size-5 animate-spin" /> : <Search aria-hidden="true" className="size-5" />}
                    </Button>
                  </div>
                  {voice.state === "speaking" ? (
                    <p aria-live="polite" className="mt-2 text-xs font-bold text-accent">
                      SSDI Agent is speaking. Wait for “Listening—speak now.”
                    </p>
                  ) : null}
                  {voice.state === "listening" ? (
                    <p aria-live="assertive" className="mt-2 text-xs font-bold text-success">
                      Listening—speak now. Press the square when finished.
                    </p>
                  ) : null}
                </form>

                {busy && agentStatus ? (
                  <div className="mt-4 rounded-[var(--radius-control)] bg-accent-soft p-3.5" role="status">
                    <div className="flex items-start gap-3">
                      <LoaderCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 animate-spin text-accent" />
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-accent">
                          Step {agentStatus.step} of {MAX_ACTIONS}
                        </p>
                        <p className="mt-1 text-sm leading-relaxed text-foreground">
                          {agentStatus.message}
                        </p>
                      </div>
                    </div>
                    <Button className="mt-3 w-full" onClick={() => void stopComputer()} variant="secondary">
                      <Square aria-hidden="true" className="size-3.5 fill-current" />
                      Stop Windows task
                    </Button>
                  </div>
                ) : null}

                {observation ? (
                  <div className="mt-4 rounded-[var(--radius-control)] border border-border bg-surface-subtle p-3.5">
                    <p className="text-xs font-bold text-muted">Accessibility view</p>
                    <p className="mt-1 truncate text-sm font-bold" title={observation.activeWindow.title}>
                      {observation.activeWindow.title || "Windows desktop"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {observation.elements.length} accessible controls available to the agent
                    </p>
                  </div>
                ) : null}

                {activities.length ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="text-sm font-bold">What SSDI Agent is doing</p>
                    <ol aria-live="polite" className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                      {activities.slice(-6).map((activity) => (
                        <li className="flex gap-2.5 text-sm leading-relaxed" key={activity.id}>
                          <ActivityMark phase={activity.phase} />
                          <span className={activity.phase === "failed" ? "text-danger" : "text-muted"}>
                            {activity.message}
                          </span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}

                {candidates.length ? (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="font-bold">Verified files</p>
                    <ul className="mt-3 divide-y divide-border">
                      {candidates.map((candidate) => (
                        <li className="py-4 first:pt-0" key={candidate.id}>
                          <div className="flex items-start gap-3">
                            <span className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-control)] bg-primary-soft text-primary">
                              {candidate.extension.match(/png|jpe?g|webp|bmp/) ? <ImageIcon aria-hidden="true" className="size-5" /> : <FileSearch aria-hidden="true" className="size-5" />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-bold" title={candidate.name}>{candidate.name}</p>
                              <p className="mt-0.5 truncate text-xs text-muted" title={candidate.displayPath}>{candidate.displayPath}</p>
                              <p className="mt-2 text-sm leading-relaxed text-muted">{candidate.evidence[0]}</p>
                            </div>
                          </div>
                          {previews[candidate.id] ? (
                            // A local data URL returned by the approved Electron bridge.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              alt={`Preview of ${candidate.name}`}
                              className="mt-3 max-h-48 w-full rounded-[var(--radius-control)] bg-surface-subtle object-contain"
                              src={previews[candidate.id]}
                            />
                          ) : null}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button onClick={() => void preview(candidate)} size="small" variant="secondary">Preview</Button>
                            <Button onClick={() => void openCandidate(candidate)} size="small" variant="quiet">
                              <ExternalLink aria-hidden="true" className="size-4" /> Open
                            </Button>
                            <Button onClick={() => void toggleLinked(candidate.id)} size="small" variant="quiet">
                              {linked.has(candidate.id) ? <Check aria-hidden="true" className="size-4" /> : null}
                              {linked.has(candidate.id) ? "Added to case" : "Use for this case"}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {error ? (
                  <p aria-live="assertive" className="mt-4 rounded-[var(--radius-control)] bg-danger-soft p-3 text-sm font-bold text-danger">
                    {error}
                  </p>
                ) : null}
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  SSDI Agent sends active-window accessibility descriptions to its hosted agent. It will not type passwords or confirm destructive actions.
                </p>
              </>
            )}
          </div>
        </section>
      ) : (
        <button
          className="flex min-h-12 items-center gap-2 rounded-full bg-accent px-4 font-bold text-white shadow-[0_8px_28px_oklch(0.24_0.09_245/0.28)] transition-transform hover:-translate-y-0.5"
          onClick={() => setOpen(true)}
          type="button"
        >
          <FileSearch aria-hidden="true" className="size-5" />
          Use Windows
          <ChevronDown aria-hidden="true" className="size-4 rotate-180 opacity-70" />
        </button>
      )}
    </div>
  );
}

function ActivityMark({ phase }: { phase: ActivityEvent["phase"] }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-1.5 size-2 shrink-0 rounded-full",
        phase === "failed" && "bg-danger",
        phase === "completed" && "bg-success",
        phase === "progress" && "bg-warning",
        phase === "started" && "bg-accent",
      )}
    />
  );
}

function collectCandidates(result: ComputerToolResult, target: Map<string, CandidateFile>) {
  for (const candidate of result.candidates ?? []) target.set(candidate.id, candidate);
  if (result.candidate) target.set(result.candidate.id, result.candidate);
}

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message) return fallback;
  const remoteMessage = error.message.match(/Error invoking remote method '[^']+': Error: ([^\r\n]+)/i)?.[1];
  return remoteMessage || error.message.split(/\r?\n/, 1)[0];
}

function voiceRequestPrompt(locale: SupportedLocale) {
  if (locale === "es-US") return "¿Qué quiere que haga en Windows?";
  if (locale === "zh-CN") return "您希望我在 Windows 中做什么？";
  return "What would you like me to do in Windows?";
}
