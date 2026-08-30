"use client";

import type { SupportedLocale } from "@/lib/case/types";
import {
  computerTurnResponseSchema,
  type ComputerEnvironment,
  type ComputerObservation,
  type ComputerTurnResponse,
} from "@/lib/computer/schema";

export async function requestComputerTurn(input: {
  request: string;
  locale: SupportedLocale;
  environment: ComputerEnvironment;
  history: Array<{ role: "assistant" | "user"; content: string }>;
  toolResult: string | null;
  observation: ComputerObservation | null;
  availableCandidateIds: string[];
  signal?: AbortSignal;
}): Promise<ComputerTurnResponse> {
  const { signal, ...payload } = input;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 25_000);
  let response: Response;
  try {
    response = await fetch("/api/computer/turn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error("The agent took longer than 25 seconds to choose its next action. Try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", abortFromCaller);
  }
  const body = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String(body.error)
        : "SSDI Agent could not plan the next computer action.";
    throw new Error(message);
  }
  const parsed = computerTurnResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new Error("SSDI Agent received an invalid computer plan.");
  }
  return parsed.data;
}

export function serializeToolResult(value: unknown) {
  const serialized = JSON.stringify(value, (key, nested) =>
    key === "previewDataUrl" || key === "observation" ? undefined : nested,
  );
  return serialized.length <= 40_000
    ? serialized
    : `${serialized.slice(0, 39_960)}…[truncated]`;
}
