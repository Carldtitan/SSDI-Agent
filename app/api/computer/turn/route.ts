import { NextResponse } from "next/server";

import {
  computerTurnRequestSchema,
  computerTurnResponseSchema,
  type ComputerObservation,
} from "@/lib/computer/schema";
import { generateStructured } from "@/lib/anthropic/structured";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SYSTEM_PROMPT = `You are the SSDI Agent's real Windows computer-use planner.

You choose exactly one typed action. SSDI Agent executes it on the user's visible Windows desktop, reads the active window's accessibility descriptions, and returns that real observation on the next turn.

Rules:
- Use only these exact tool names and arguments. Never rename a tool:
  observe_windows {};
  open_file_explorer {location: home|downloads|documents|desktop};
  launch_app {app: calculator|explorer|notepad|paint|photos|settings};
  focus_window {title}; invoke_element {elementId}; click {x,y};
  type_text {text}; press_keys {keys,repeats}; scroll {direction,amount};
  wait {milliseconds}; register_selected_file {};
  extract_text {candidateId}; preview_candidate {candidateId}; open_candidate {candidateId}.
- Handle arbitrary read-only Windows tasks. Never restrict requests to SSDI document types.
- Use the Windows UI Automation elements and their bounds. Prefer invoke_element with a current element ID; use coordinate clicks only when no invokable accessible element represents the target.
- For local-file requests, visibly open File Explorer, use its search or navigation controls, inspect likely results, and verify the requested document. Do not finish from loose word overlap.
- The Windows desktop must visibly show the work. A candidate is relevant only when its filename, extracted content, or visible contents specifically establishes the requested document.
- When the correct File Explorer item is selected, use register_selected_file. Finish with only candidate IDs returned by real native results.
- After every UI-changing action, reason from the new observation. Never assume an action worked.
- Never invent a window, control, filename, path, candidate ID, content, action, or success.
- Do not open terminals, command prompts, developer consoles, Registry Editor, Task Manager, credential tools, or UAC prompts.
- Do not enter passwords, reveal secrets, delete, move, rename, purchase, upload, sign, send, submit, or change system or security settings.
- If a task requires a sensitive or destructive action, stop and explain what remains for the user.
- state act requires one non-null action and no candidateIds.
- state finish, clarify, and error require a null action.
- candidateIds in finish must be exact IDs from availableCandidateIds. Use an empty list when no verified file was found.
- Narration must be short, plain, and in the requested locale. Do not narrate an action as complete before its result exists.
- Return only schema-conforming data.`;

export async function POST(request: Request) {
  const parsed = computerTurnRequestSchema.safeParse(await safeJson(request));
  if (!parsed.success) {
    return noStore(
      NextResponse.json(
        { error: "Add a valid request and connected Windows environment." },
        { status: 400 },
      ),
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return noStore(
      NextResponse.json(
        { error: "Computer planning is not configured." },
        { status: 503 },
      ),
    );
  }

  try {
    const input = parsed.data;
    const plan = await generateStructured({
      schema: computerTurnResponseSchema,
      responseJsonSchema: COMPUTER_RESPONSE_JSON_SCHEMA,
      maxOutputTokens: 1_400,
      systemInstruction: SYSTEM_PROMPT,
      timeoutMs: 30_000,
      prompt: `${formatHistory(input.history)}

${currentTurnContent({
            locale: input.locale,
            request: input.request,
            environment: input.environment,
            toolResult: input.toolResult,
            observation: input.observation,
            availableCandidateIds: input.availableCandidateIds,
          })}`,
    });
    enforceStateShape(plan);
    enforceCandidateProvenance(plan, input.availableCandidateIds);
    return noStore(NextResponse.json(plan));
  } catch (error) {
    console.error("Computer planning failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return noStore(
      NextResponse.json(
        { error: "SSDI Agent could not plan the next Windows action. Try again." },
        { status: 502 },
      ),
    );
  }
}

const COMPUTER_RESPONSE_JSON_SCHEMA = {
  type: "object",
  properties: {
    state: { type: "string", enum: ["act", "finish", "clarify", "error"] },
    narration: { type: "string", minLength: 1, maxLength: 700 },
    action: {
      anyOf: [
        {
          type: "object",
          properties: {
            tool: {
              type: "string",
              enum: [
                "observe_windows",
                "open_file_explorer",
                "launch_app",
                "focus_window",
                "invoke_element",
                "click",
                "type_text",
                "press_keys",
                "scroll",
                "wait",
                "register_selected_file",
                "extract_text",
                "preview_candidate",
                "open_candidate",
              ],
            },
            args: { type: "object" },
          },
          required: ["tool", "args"],
        },
        { type: "null" },
      ],
    },
    candidateIds: {
      type: "array",
      items: { type: "string" },
      maxItems: 12,
    },
  },
  required: ["state", "narration", "action", "candidateIds"],
} satisfies Record<string, unknown>;

function formatHistory(
  history: Array<{ role: "assistant" | "user"; content: string }>,
) {
  if (!history.length) return "Conversation history: (No earlier turns.)";
  return `Conversation history:\n${history
    .map(
      (message) =>
        `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`,
    )
    .join("\n")}`;
}

function currentTurnContent(input: {
  locale: string;
  request: string;
  environment: unknown;
  toolResult: string | null;
  observation: ComputerObservation | null;
  availableCandidateIds: string[];
}) {
  return `Conversation locale: ${input.locale}
Original request: ${input.request}
Windows environment: ${JSON.stringify(input.environment)}
Latest native tool result: ${input.toolResult ?? "(No tool has run yet.)"}
Available verified candidate IDs: ${JSON.stringify(input.availableCandidateIds)}
Latest active-window accessibility descriptions: ${
    input.observation
      ? JSON.stringify({
          activeWindow: input.observation.activeWindow,
          elements: input.observation.elements,
        })
      : "(No Windows observation yet.)"
  }

Choose the next state.`;
}

function enforceStateShape(plan: {
  state: "act" | "finish" | "clarify" | "error";
  action: unknown | null;
  candidateIds: string[];
}) {
  if (plan.state === "act" && !plan.action) {
    throw new Error("Action state omitted its action");
  }
  if (plan.state !== "act" && plan.action) {
    throw new Error("Terminal state included an action");
  }
  if (plan.state === "act" && plan.candidateIds.length) {
    throw new Error("Action state included final candidates");
  }
}

function enforceCandidateProvenance(
  plan: { state: string; candidateIds: string[] },
  availableCandidateIds: string[],
) {
  if (plan.state !== "finish" || !plan.candidateIds.length) return;
  const available = new Set(availableCandidateIds);
  if (plan.candidateIds.some((id) => !available.has(id))) {
    throw new Error("Plan referenced an undiscovered candidate");
  }
}

async function safeJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}
