import { z } from "zod";

export const approvedRootSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(260),
  displayPath: z.string().min(1).max(1_000),
});

export const computerEnvironmentSchema = z.object({
  platform: z.literal("win32"),
  release: z.string().max(100),
  arch: z.string().max(40),
  roots: z.array(approvedRootSchema).max(8),
  capabilities: z
    .array(
      z.enum([
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
      ]),
    )
    .max(20),
  limits: z.object({
    maxFiles: z.number().int().positive().max(20_000),
    maxDepth: z.number().int().positive().max(32),
    maxFileBytes: z.number().int().positive().max(100_000_000),
    maxExcerptCharacters: z.number().int().positive().max(10_000),
  }),
});

const emptyArgs = z.object({}).strict();

export const observeWindowsActionSchema = z.object({
  tool: z.literal("observe_windows"),
  args: emptyArgs,
});

export const openFileExplorerActionSchema = z.object({
  tool: z.literal("open_file_explorer"),
  args: z.object({
    location: z.enum(["home", "downloads", "documents", "desktop"]).default("home"),
  }),
});

export const launchAppActionSchema = z.object({
  tool: z.literal("launch_app"),
  args: z.object({
    app: z.enum(["calculator", "explorer", "notepad", "paint", "photos", "settings"]),
  }),
});

export const focusWindowActionSchema = z.object({
  tool: z.literal("focus_window"),
  args: z.object({ title: z.string().trim().min(1).max(200) }),
});

export const invokeElementActionSchema = z.object({
  tool: z.literal("invoke_element"),
  args: z.object({ elementId: z.string().trim().min(1).max(80) }),
});

export const clickActionSchema = z.object({
  tool: z.literal("click"),
  args: z.object({
    x: z.number().int().nonnegative().max(4_000),
    y: z.number().int().nonnegative().max(4_000),
  }),
});

export const typeTextActionSchema = z.object({
  tool: z.literal("type_text"),
  args: z.object({ text: z.string().min(1).max(1_000) }),
});

const keySchema = z.enum([
  "ALT",
  "BACKSPACE",
  "CTRL",
  "DELETE",
  "DOWN",
  "END",
  "ENTER",
  "ESCAPE",
  "F4",
  "HOME",
  "LEFT",
  "RIGHT",
  "SHIFT",
  "SPACE",
  "TAB",
  "UP",
  "WIN",
  "A",
  "C",
  "F",
  "L",
  "V",
]);

export const pressKeysActionSchema = z.object({
  tool: z.literal("press_keys"),
  args: z.object({
    keys: z.array(keySchema).min(1).max(4),
    repeats: z.number().int().min(1).max(5).default(1),
  }),
});

export const scrollActionSchema = z.object({
  tool: z.literal("scroll"),
  args: z.object({
    direction: z.enum(["up", "down"]),
    amount: z.number().int().min(1).max(10),
  }),
});

export const waitActionSchema = z.object({
  tool: z.literal("wait"),
  args: z.object({ milliseconds: z.number().int().min(250).max(3_000) }),
});

export const registerSelectedFileActionSchema = z.object({
  tool: z.literal("register_selected_file"),
  args: emptyArgs,
});

const candidateAction = (tool: "extract_text" | "preview_candidate" | "open_candidate") =>
  z.object({
    tool: z.literal(tool),
    args: z.object({ candidateId: z.string().min(1).max(100) }),
  });

export const computerToolRequestSchema = z.discriminatedUnion("tool", [
  observeWindowsActionSchema,
  openFileExplorerActionSchema,
  launchAppActionSchema,
  focusWindowActionSchema,
  invokeElementActionSchema,
  clickActionSchema,
  typeTextActionSchema,
  pressKeysActionSchema,
  scrollActionSchema,
  waitActionSchema,
  registerSelectedFileActionSchema,
  candidateAction("extract_text"),
  candidateAction("preview_candidate"),
  candidateAction("open_candidate"),
]);

const windowBoundsSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
});

export const computerObservationSchema = z.object({
  capturedAt: z.string().max(80),
  activeWindow: z.object({
    title: z.string().max(500),
    processName: z.string().max(200),
    bounds: windowBoundsSchema,
  }),
  elements: z.array(z.object({
    id: z.string().max(80),
    name: z.string().max(500),
    automationId: z.string().max(300),
    controlType: z.string().max(100),
    enabled: z.boolean(),
    bounds: windowBoundsSchema,
  })).max(300),
});

export const computerTurnResponseSchema = z.object({
  state: z.enum(["act", "finish", "clarify", "error"]),
  narration: z.string().trim().min(1).max(700),
  action: computerToolRequestSchema.nullable(),
  candidateIds: z.array(z.string().min(1).max(100)).max(12),
});

export const computerTurnRequestSchema = z.object({
  request: z.string().trim().min(1).max(1_500),
  locale: z.enum(["en-US", "es-US", "zh-CN"]).default("en-US"),
  environment: computerEnvironmentSchema,
  history: z
    .array(
      z.object({
        role: z.enum(["assistant", "user"]),
        content: z.string().trim().min(1).max(2_000),
      }),
    )
    .max(12)
    .default([]),
  toolResult: z.string().max(40_000).nullable().default(null),
  observation: computerObservationSchema.nullable().default(null),
  availableCandidateIds: z.array(z.string().min(1).max(100)).max(50).default([]),
});

export type ApprovedRoot = z.infer<typeof approvedRootSchema>;
export type ComputerEnvironment = z.infer<typeof computerEnvironmentSchema>;
export type ComputerToolRequest = z.infer<typeof computerToolRequestSchema>;
export type ComputerTurnResponse = z.infer<typeof computerTurnResponseSchema>;
export type ComputerObservation = z.infer<typeof computerObservationSchema>;

export interface CandidateFile {
  id: string;
  name: string;
  displayPath: string;
  extension: string;
  size: number;
  modifiedAt: string;
  score: number;
  evidence: string[];
  excerpt?: string;
}

export interface ActivityEvent {
  id: string;
  phase: "started" | "progress" | "completed" | "failed";
  message: string;
  speak: boolean;
  createdAt: string;
}

export interface ComputerToolResult {
  ok: boolean;
  tool: ComputerToolRequest["tool"];
  candidates?: CandidateFile[];
  candidate?: CandidateFile;
  previewDataUrl?: string | null;
  message?: string;
  observation?: ComputerObservation;
  [key: string]: unknown;
}
