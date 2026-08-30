import type { SupportedLocale } from "@/lib/case/types";

export type YesNoResult =
  | { ok: true; value: boolean; spoken: string }
  | { ok: false };

const yesPatterns: Record<SupportedLocale, RegExp> = {
  "en-US": /\b(?:yes|yeah|yep|correct|right|i am|i do|that is right)\b/i,
  "es-US":
    /\b(?:si|correcto|correcta|asi es|estoy listo|estoy lista|de acuerdo)\b/i,
  "zh-CN": /(?:是|对|正确|没错|可以|好的|我准备好了)/,
};

const noPatterns: Record<SupportedLocale, RegExp> = {
  "en-US": /\b(?:no|nope|incorrect|not correct|i am not|i do not|don't)\b/i,
  "es-US": /\b(?:no|incorrecto|incorrecta|no es correcto)\b/i,
  "zh-CN": /(?:不是|不对|错误|没有|否)/,
};

export function parseLocalizedYesNo(
  transcript: string,
  locale: SupportedLocale,
): YesNoResult {
  const value = comparableText(transcript, locale);
  if (noPatterns[locale].test(value)) {
    return { ok: true, value: false, spoken: noWord(locale) };
  }
  if (yesPatterns[locale].test(value)) {
    return { ok: true, value: true, spoken: yesWord(locale) };
  }
  return { ok: false };
}

export function correctionFromRejection(
  transcript: string,
  locale: SupportedLocale,
): string | null {
  const decision = parseLocalizedYesNo(transcript, locale);
  if (!decision.ok || decision.value) return null;

  let correction = transcript.trim();

  if (locale === "en-US") {
    correction = correction
      .replace(
        /^(?:no(?:pe)?|incorrect|not correct|that(?:'s| is) (?:wrong|not right))[\s,.:;!?-]*/i,
        "",
      )
      .replace(
        /^(?:(?:please\s+)?(?:don't|don’t|do not)\s+(?:save|use)(?:\s+(?:that|it|the answer))?|(?:disregard|ignore)(?:\s+(?:that|it|the answer))?)[\s,.:;!?-]*/i,
        "",
      )
      .replace(
        /^(?:actually|instead|rather|the correct answer is|the answer is|it(?:'s| is| should be)|that should be|please (?:put down|use)|(?:put down|use))[\s,.:;!?-]*/i,
        "",
      );
  } else if (locale === "es-US") {
    correction = correction
      .replace(
        /^(?:no|incorrect[oa]?|no es correcto|eso est[aá] mal)[\s,.:;!?¿¡-]*/i,
        "",
      )
      .replace(
        /^(?:(?:por favor\s+)?no\s+(?:guarde|use)(?:\s+(?:eso|esa respuesta|lo))?|(?:ignore|descarte)(?:\s+(?:eso|esa respuesta|lo))?)[\s,.:;!?¿¡-]*/i,
        "",
      )
      .replace(
        /^(?:en realidad|mejor|debe ser|la respuesta correcta es|la respuesta es|anote|use)[\s,.:;!?¿¡-]*/i,
        "",
      );
  } else {
    correction = correction
      .replace(/^(?:不是|不对|错了|错误|不)[\s，。；：！？、-]*/, "")
      .replace(
        /^(?:请)?(?:不要保存|别保存|不要用|别用|忽略|删掉)(?:刚才的|那个|这个|答案)?[\s，。；：！？、-]*/,
        "",
      )
      .replace(
        /^(?:其实|应该是|正确答案是|请改成|改成|请填写|填写)[\s，。；：！？、-]*/,
        "",
      );
  }

  const cleaned = correction.trim();
  if (
    !cleaned ||
    /^(?:please|thanks?|thank you)$/i.test(cleaned) ||
    /^(?:por favor|gracias)$/i.test(cleaned)
  ) {
    return null;
  }
  return cleaned;
}

export function explicitNone(
  transcript: string,
  locale: SupportedLocale,
): boolean {
  const patterns: Record<SupportedLocale, RegExp> = {
    "en-US":
      /^(?:none|no|no more|no more providers|no more jobs|nobody else|no one else|that is all|that's all)$/i,
    "es-US":
      /^(?:ninguno|ninguna|no|no hay mas|no hay mas proveedores|no hay mas trabajos|eso es todo)$/i,
    "zh-CN": /^(?:没有|没有了|没有其他|没有其他医疗机构|没有其他工作|就这些)$/,
  };
  return patterns[locale].test(comparableText(transcript, locale));
}

export function readyAnswer(
  transcript: string,
  locale: SupportedLocale,
): boolean {
  const parsed = parseLocalizedYesNo(transcript, locale);
  return parsed.ok
    ? parsed.value
    : {
        "en-US": /\b(?:ready|begin|start)\b/i,
        "es-US": /\b(?:listo|lista|comenzar|empezar)\b/i,
        "zh-CN": /(?:准备好了|开始)/,
      }[locale].test(comparableText(transcript, locale));
}

export function confirmationPrompt(
  summary: string,
  locale: SupportedLocale,
): string {
  return {
    "en-US": `I heard: ${summary}. Is that correct?`,
    "es-US": `Entendí: ${summary}. ¿Es correcto?`,
    "zh-CN": `我听到的是：${summary}。对吗？`,
  }[locale];
}

export function confirmationRetry(locale: SupportedLocale): string {
  return {
    "en-US": "Please say yes if that is correct, or no to answer again.",
    "es-US":
      "Diga sí si es correcto, o no para responder de nuevo.",
    "zh-CN": "如果正确，请说“是”；如果需要重新回答，请说“不是”。",
  }[locale];
}

export function yesWord(locale: SupportedLocale): string {
  return { "en-US": "yes", "es-US": "sí", "zh-CN": "是" }[locale];
}

export function noWord(locale: SupportedLocale): string {
  return { "en-US": "no", "es-US": "no", "zh-CN": "不是" }[locale];
}

function comparableText(
  transcript: string,
  locale: SupportedLocale,
): string {
  const value = transcript.trim();
  return locale === "es-US"
    ? value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    : value;
}
