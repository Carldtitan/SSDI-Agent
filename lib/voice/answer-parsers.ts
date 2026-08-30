export type ParsedAnswer<T> =
  | { ok: true; value: T; spoken: string }
  | { ok: false; reason: string };

const UNKNOWN_PATTERN =
  /\b(?:don'?t know|do not know|not sure|unsure|unknown|can'?t remember|cannot remember)\b/i;

export function parseYesNo(transcript: string): ParsedAnswer<boolean> {
  const normalized = transcript.trim().toLocaleLowerCase();
  if (
    /\b(?:no|nope|negative|incorrect)\b/.test(normalized) ||
    /\b(?:i am not|i'm not|do not|don't|does not|doesn't|not correct)\b/.test(
      normalized,
    )
  ) {
    return { ok: true, value: false, spoken: "no" };
  }
  if (
    /\b(?:yes|yeah|yep|affirmative|correct|right)\b/.test(normalized) ||
    /\b(?:i am|i'm|i do|it is|that is|that's)\b/.test(normalized)
  ) {
    return { ok: true, value: true, spoken: "yes" };
  }
  return {
    ok: false,
    reason: "Please answer yes or no.",
  };
}

export function parseMoney(transcript: string): ParsedAnswer<number> {
  const value = parseSpokenNumber(transcript);
  if (value === null || value < 0) {
    return {
      ok: false,
      reason: "Please say a dollar amount, such as fourteen hundred dollars.",
    };
  }
  return {
    ok: true,
    value,
    spoken: formatUsd(value),
  };
}

export function parseCreditCount(
  transcript: string,
  maximum: number,
): ParsedAnswer<number | null> {
  if (UNKNOWN_PATTERN.test(transcript)) {
    return { ok: true, value: null, spoken: "unknown" };
  }
  const value = parseSpokenNumber(transcript);
  if (value === null || !Number.isInteger(value) || value < 0 || value > maximum) {
    return {
      ok: false,
      reason: `Say a number from zero to ${maximum}, or say I don't know.`,
    };
  }
  return {
    ok: true,
    value,
    spoken: `${value} work credit${value === 1 ? "" : "s"}`,
  };
}

export function parseWorkYears(transcript: string): ParsedAnswer<number | null> {
  if (UNKNOWN_PATTERN.test(transcript)) {
    return { ok: true, value: null, spoken: "unknown" };
  }
  const value = parseSpokenNumber(transcript);
  if (value === null || value < 0 || value > 60) {
    return {
      ok: false,
      reason: "Say the number of years, or say I don't know.",
    };
  }
  return {
    ok: true,
    value,
    spoken: `${value} year${value === 1 ? "" : "s"}`,
  };
}

export function parseDateAnswer(transcript: string): ParsedAnswer<string> {
  const normalized = transcript
    .trim()
    .replace(/(\d+)(st|nd|rd|th)\b/gi, "$1");
  const isoMatch = normalized.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const parsed = isoMatch
    ? new Date(`${isoMatch[0]}T00:00:00Z`)
    : new Date(normalized);
  if (Number.isNaN(parsed.valueOf())) {
    return {
      ok: false,
      reason: "Please say the month, day, and year.",
    };
  }
  const value = [
    parsed.getUTCFullYear(),
    String(parsed.getUTCMonth() + 1).padStart(2, "0"),
    String(parsed.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return {
    ok: true,
    value,
    spoken: new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(parsed),
  };
}

export function parseSpokenNumber(transcript: string): number | null {
  const digitMatch = transcript
    .replace(/,/g, "")
    .match(/(?:^|\s)\$?(\d+(?:\.\d+)?)(?:\s|$)/);
  if (digitMatch) return Number(digitMatch[1]);

  const tokens = transcript
    .toLocaleLowerCase()
    .replace(/-/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      (token) =>
        !["about", "around", "approximately", "dollar", "dollars", "and"].includes(
          token,
        ),
    );
  const values = tokens
    .map((token) => SMALL_NUMBERS[token] ?? TENS[token] ?? null)
    .filter((value): value is number => value !== null);
  if (
    tokens.length === 2 &&
    values.length === 2 &&
    values[0] >= 10 &&
    values[0] < 20 &&
    values[1] >= 10
  ) {
    return values[0] * 100 + values[1];
  }

  let total = 0;
  let current = 0;
  let found = false;
  for (const token of tokens) {
    if (token in SMALL_NUMBERS) {
      current += SMALL_NUMBERS[token];
      found = true;
    } else if (token in TENS) {
      current += TENS[token];
      found = true;
    } else if (token === "hundred") {
      current = Math.max(1, current) * 100;
      found = true;
    } else if (token === "thousand") {
      total += Math.max(1, current) * 1000;
      current = 0;
      found = true;
    }
  }
  return found ? total + current : null;
}

const SMALL_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}
