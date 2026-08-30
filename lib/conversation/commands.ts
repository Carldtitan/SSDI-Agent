import type { SupportedLocale } from "@/lib/case/types";

export type VoiceIntent = "answer" | "command" | "answer_and_command";

export type VoiceCommand =
  | "repeat"
  | "explain"
  | "pause"
  | "continue"
  | "go_back"
  | "correct"
  | "defer"
  | "status"
  | "change_language"
  | "review"
  | "generate_packet"
  | "download_packet"
  | "open_records"
  | "mark_received";

export interface ParsedVoiceCommand {
  intent: "command";
  command: VoiceCommand;
  targetLocale?: SupportedLocale;
  destructive: boolean;
  deferReason?: "unknown" | "come_back_later";
}

const phrases: Record<
  Exclude<VoiceCommand, "change_language">,
  readonly string[]
> = {
  repeat: [
    "repeat",
    "say that again",
    "repeat the question",
    "repita",
    "dígalo de nuevo",
    "重复",
    "再说一遍",
  ],
  explain: [
    "explain",
    "why do you need that",
    "why does this matter",
    "explique",
    "por qué",
    "解释",
    "为什么",
  ],
  pause: ["pause", "stop listening", "pausa", "暂停", "停一下"],
  continue: [
    "continue",
    "resume",
    "i'm ready",
    "i am ready",
    "estoy listo",
    "estoy lista",
    "continuar",
    "继续",
    "我准备好了",
  ],
  go_back: ["go back", "previous question", "volver", "atrás", "返回", "上一个"],
  correct: [
    "correct that",
    "change my last answer",
    "disregard that",
    "ignore that",
    "corrija eso",
    "cambie mi respuesta",
    "no tome en cuenta eso",
    "更正",
    "修改刚才的回答",
    "忽略刚才的回答",
  ],
  defer: [
    "skip",
    "come back later",
    "i don't know",
    "i dont know",
    "i do not know",
    "no sé",
    "después",
    "omitir",
    "不知道",
    "稍后再说",
    "跳过",
  ],
  status: [
    "status",
    "what is left",
    "what's left",
    "estado",
    "qué falta",
    "还剩什么",
    "进度",
  ],
  review: ["review", "review my answers", "revisar", "核对", "检查回答"],
  generate_packet: [
    "generate packet",
    "create documents",
    "create my documents",
    "crear documentos",
    "generar documentos",
    "生成文件",
    "创建文件",
  ],
  download_packet: [
    "download packet",
    "download documents",
    "descargar documentos",
    "下载文件",
  ],
  open_records: [
    "open records",
    "show records",
    "abrir expedientes",
    "ver expedientes",
    "打开医疗记录",
    "查看医疗记录",
  ],
  mark_received: [
    "mark received",
    "records received",
    "marcar recibido",
    "expedientes recibidos",
    "标记为已收到",
    "已经收到",
  ],
};

export function parseVoiceCommand(
  transcript: string,
  _locale?: SupportedLocale,
): ParsedVoiceCommand | null {
  void _locale;
  const normalized = normalizeCommandText(transcript);

  const targetLocale = languageTarget(normalized);
  if (targetLocale) {
    return {
      intent: "command",
      command: "change_language",
      targetLocale,
      destructive: false,
    };
  }

  for (const [command, candidates] of Object.entries(phrases) as Array<
    [Exclude<VoiceCommand, "change_language">, readonly string[]]
  >) {
    if (
      candidates.some(
        (candidate) => {
          const normalizedCandidate = normalizeCommandText(candidate);
          return (
            normalized === normalizedCandidate ||
            normalized.startsWith(`${normalizedCandidate} `)
          );
        },
      )
    ) {
      return {
        intent: "command",
        command,
        destructive: command === "correct" || command === "mark_received",
        deferReason:
          command === "defer"
            ? /dont know|do not know|no se|不知道/.test(normalized)
              ? "unknown"
              : "come_back_later"
            : undefined,
      };
    }
  }
  return null;
}

function languageTarget(value: string): SupportedLocale | null {
  if (
    /(?:switch|change|speak).*(?:english)|(?:cambiar|hablar).*(?:ingles)|说英语|切换.*英语/.test(
      value,
    )
  ) {
    return "en-US";
  }
  if (
    /(?:switch|change|speak).*(?:spanish)|(?:cambiar|hablar).*(?:espanol)|说西班牙语|切换.*西班牙语/.test(
      value,
    )
  ) {
    return "es-US";
  }
  if (
    /(?:switch|change|speak).*(?:mandarin|chinese)|(?:cambiar|hablar).*(?:mandarin|chino)|说中文|切换.*中文/.test(
      value,
    )
  ) {
    return "zh-CN";
  }
  return null;
}

function normalizeCommandText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[“”"'’.,!?¿¡。！？]/g, "")
    .replace(/\s+/g, " ");
}
