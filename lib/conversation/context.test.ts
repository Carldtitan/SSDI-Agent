import { describe, expect, it } from "vitest";

import { buildConversationContext } from "@/lib/conversation/context";
import type { InterviewTurn } from "@/lib/case/types";

function turn(index: number, status: InterviewTurn["status"] = "extracted") {
  return {
    id: `turn-${index}`,
    prompt: `Question ${index}`,
    transcript: `Answer ${index}`,
    source: "voice",
    status,
    createdAt: new Date(2026, 0, index + 1).toISOString(),
    locale: "en-US",
  } satisfies InterviewTurn;
}

describe("conversation context", () => {
  it("preserves the most recent 24 successful turns in speaking order", () => {
    const context = buildConversationContext([
      ...Array.from({ length: 26 }, (_, index) => turn(index)),
      turn(27, "failed"),
    ]);

    expect(context).toHaveLength(48);
    expect(context[0]).toEqual({
      role: "assistant",
      content: "Question 2",
    });
    expect(context.at(-1)).toEqual({
      role: "user",
      content: "Answer 25",
    });
  });
});

