import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

// Claude constrains the response to the JSON schema, and Zod re-validates it
// here. Both layers stay: a schema-shaped answer is not automatically a valid
// one, and this pipeline must fail closed rather than accept junk facts.
const DEFAULT_MODEL = "claude-opus-5";

// Adaptive thinking is billed against max_tokens, so the caller's answer budget
// alone would truncate the JSON mid-object. This headroom keeps the requested
// output budget intact.
const THINKING_HEADROOM_TOKENS = 4_000;

type StructuredGenerationOptions<T> = {
  maxOutputTokens: number;
  prompt: string;
  responseJsonSchema?: Record<string, unknown>;
  schema: z.ZodType<T>;
  systemInstruction: string;
  timeoutMs?: number;
};

export async function generateStructured<T>({
  maxOutputTokens,
  prompt,
  responseJsonSchema,
  schema,
  systemInstruction,
  timeoutMs = 30_000,
}: StructuredGenerationOptions<T>): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic is not configured");

  const client = new Anthropic({
    apiKey,
    maxRetries: 1,
    timeout: timeoutMs,
  });

  // Copy before deleting $schema: callers may pass a shared module constant.
  const jsonSchema: Record<string, unknown> = {
    ...(responseJsonSchema ??
      (z.toJSONSchema(schema) as Record<string, unknown>)),
  };
  delete jsonSchema.$schema;

  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    max_tokens: maxOutputTokens + THINKING_HEADROOM_TOKENS,
    system: systemInstruction,
    messages: [{ role: "user", content: prompt }],
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: jsonSchema },
    },
    thinking: { type: "adaptive" },
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to return a structured response");
  }
  if (
    response.stop_reason === "max_tokens" ||
    response.stop_reason === "model_context_window_exceeded"
  ) {
    throw new Error("Claude ran out of room before completing the JSON");
  }

  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) throw new Error("Claude returned an empty structured response");

  return schema.parse(JSON.parse(text));
}
