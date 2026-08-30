import type { InterviewTurn } from "@/lib/case/types";

export interface ConversationContextMessage {
  role: "assistant" | "user";
  content: string;
}

const MAX_CONTEXT_TURNS = 24;
const MAX_CONTEXT_MESSAGE_LENGTH = 2_000;

export function buildConversationContext(
  turns: InterviewTurn[],
): ConversationContextMessage[] {
  return turns
    .filter((turn) => turn.status === "extracted")
    .slice(-MAX_CONTEXT_TURNS)
    .flatMap((turn) => [
      {
        role: "assistant" as const,
        content: turn.prompt.slice(0, MAX_CONTEXT_MESSAGE_LENGTH),
      },
      {
        role: "user" as const,
        content: turn.transcript.slice(0, MAX_CONTEXT_MESSAGE_LENGTH),
      },
    ]);
}
