import { describe, expect, it } from "vitest";

import {
  parseCreditCount,
  parseDateAnswer,
  parseMoney,
  parseSpokenNumber,
  parseYesNo,
} from "@/lib/voice/answer-parsers";

describe("voice answer parsers", () => {
  it("understands natural yes and no confirmations", () => {
    expect(parseYesNo("Yes, I am.")).toMatchObject({ ok: true, value: true });
    expect(parseYesNo("No, I am not.")).toMatchObject({
      ok: true,
      value: false,
    });
    expect(parseYesNo("maybe")).toMatchObject({ ok: false });
  });

  it("understands spoken earnings amounts", () => {
    expect(parseSpokenNumber("one thousand four hundred eighty dollars")).toBe(
      1480,
    );
    expect(parseSpokenNumber("about fourteen eighty")).toBe(1480);
    expect(parseMoney("$1,690")).toMatchObject({ ok: true, value: 1690 });
  });

  it("preserves uncertainty for work credits", () => {
    expect(parseCreditCount("I don't know", 40)).toEqual({
      ok: true,
      value: null,
      spoken: "unknown",
    });
    expect(parseCreditCount("twenty", 40)).toMatchObject({
      ok: true,
      value: 20,
    });
  });

  it("normalizes a spoken date for confirmation", () => {
    expect(parseDateAnswer("April 12th 1978")).toEqual({
      ok: true,
      value: "1978-04-12",
      spoken: "April 12, 1978",
    });
  });
});
