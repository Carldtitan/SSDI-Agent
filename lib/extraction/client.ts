"use client";

import type { SupportedLocale } from "@/lib/case/types";
import type { ConversationContextMessage } from "@/lib/conversation/context";
import type { InterviewExtraction } from "@/lib/extraction/schema";

export async function requestInterviewExtraction(input: {
  turnId: string;
  locale: SupportedLocale;
  topic: string;
  prompt: string;
  transcript: string;
  history?: ConversationContextMessage[];
}): Promise<InterviewExtraction> {
  const response = await fetch("/api/interview/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as {
    extraction?: InterviewExtraction;
    error?: string;
  };
  if (!response.ok || !body.extraction) {
    throw new Error(
      body.error ||
        "Your transcript was kept, but the answer could not be processed.",
    );
  }
  return body.extraction;
}
