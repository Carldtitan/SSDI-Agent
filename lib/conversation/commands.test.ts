import { describe, expect, it } from "vitest";

import { parseVoiceCommand } from "@/lib/conversation/commands";

describe("voice command parser", () => {
  it.each([
    ["skip", "defer"],
    ["I don't know", "defer"],
    ["No sé", "defer"],
    ["disregard that", "correct"],
    ["repita", "repeat"],
    ["暂停", "pause"],
    ["descargar documentos", "download_packet"],
  ])("keeps %s out of application answers", (transcript, command) => {
    expect(parseVoiceCommand(transcript)?.command).toBe(command);
  });

  it.each([
    ["switch to Spanish", "es-US"],
    ["hablar inglés", "en-US"],
    ["hablar ingles", "en-US"],
    ["切换到中文", "zh-CN"],
  ])("detects a language change in %s", (transcript, locale) => {
    expect(parseVoiceCommand(transcript)?.targetLocale).toBe(locale);
  });

  it("does not classify an ordinary answer as a command", () => {
    expect(parseVoiceCommand("I worked at a grocery store")).toBeNull();
  });
});
