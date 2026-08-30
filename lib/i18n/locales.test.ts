import { describe, expect, it } from "vitest";

import {
  copy,
  localeDefinition,
  SUPPORTED_LOCALES,
} from "@/lib/i18n/locales";

describe("locale registry", () => {
  it("offers exactly the three V1 languages in native labels", () => {
    expect(SUPPORTED_LOCALES.map((entry) => entry.nativeLabel)).toEqual([
      "English",
      "Español",
      "中文（普通话）",
    ]);
  });

  it("provides the correct speech locale for each language", () => {
    expect(localeDefinition("en-US").speechRecognitionLanguage).toBe("en-US");
    expect(localeDefinition("es-US").speechRecognitionLanguage).toBe("es-US");
    expect(localeDefinition("zh-CN").speechRecognitionLanguage).toBe("zh-CN");
  });

  it("introduces the product as SSDI Agent in every supported language", () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(copy.introduction[locale.id]).toContain("SSDI Agent");
    }
  });
});
