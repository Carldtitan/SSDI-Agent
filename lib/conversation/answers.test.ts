import { describe, expect, it } from "vitest";

import {
  correctionFromRejection,
  explicitNone,
  parseLocalizedYesNo,
  readyAnswer,
} from "@/lib/conversation/answers";

describe("localized conversation answers", () => {
  it("recognizes accented and unaccented Spanish confirmations", () => {
    expect(parseLocalizedYesNo("sí", "es-US")).toMatchObject({
      ok: true,
      value: true,
    });
    expect(parseLocalizedYesNo("Si, es correcto.", "es-US")).toMatchObject({
      ok: true,
      value: true,
    });
  });

  it("normalizes Spanish readiness and collection exhaustion", () => {
    expect(readyAnswer("Estoy lista", "es-US")).toBe(true);
    expect(explicitNone("No hay más proveedores", "es-US")).toBe(true);
  });

  it("recognizes Mandarin readiness and confirmations", () => {
    expect(readyAnswer("我准备好了", "zh-CN")).toBe(true);
    expect(parseLocalizedYesNo("是", "zh-CN")).toMatchObject({
      ok: true,
      value: true,
    });
  });

  it("keeps a replacement supplied with a rejected confirmation", () => {
    expect(
      correctionFromRejection(
        "No, don’t save that. It should be Jane Rivera.",
        "en-US",
      ),
    ).toBe("Jane Rivera.");
    expect(
      correctionFromRejection(
        "No, no guarde eso. Debe ser Juana Rivera.",
        "es-US",
      ),
    ).toBe("Juana Rivera.");
    expect(
      correctionFromRejection("不对，不要保存，应该是李明。", "zh-CN"),
    ).toBe("李明。");
  });

  it("asks for a correction when a rejection has no replacement", () => {
    expect(
      correctionFromRejection("No, don’t save that.", "en-US"),
    ).toBeNull();
    expect(correctionFromRejection("No, no guarde eso.", "es-US")).toBeNull();
    expect(correctionFromRejection("不对，不要保存。", "zh-CN")).toBeNull();
  });
});
