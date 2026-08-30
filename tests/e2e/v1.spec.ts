import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const artifactDirectory = path.join(process.cwd(), "output", "playwright");

test.beforeAll(async () => {
  await mkdir(artifactDirectory, { recursive: true });
});

for (const scenario of [
  {
    id: "English",
    locale: "en-US",
    languageButton: /English EN/i,
    nextQuestion: /What is your Social Security number/i,
    paused: "Paused",
    transcripts: ["I'm ready", "Ana López", "yes", "pause"],
    legalName: "Ana López",
    confirmation: "Your full legal name is Ana López. Is that right?",
  },
  {
    id: "Spanish",
    locale: "es-US",
    languageButton: /Español ES/i,
    nextQuestion: /Cuál es su número de Seguro Social/i,
    paused: "En pausa",
    transcripts: [
      "Estoy lista",
      "Mi nombre legal completo es Ana López.",
      "sí",
      "pausa",
    ],
    legalName: "Ana López",
    confirmation: "Su nombre legal completo es Ana López. ¿Es correcto?",
  },
  {
    id: "Mandarin",
    locale: "zh-CN",
    languageButton: /中文/,
    nextQuestion: /您的社会安全号码是什么/,
    paused: "已暂停",
    transcripts: ["我准备好了", "我的法定全名是王丽。", "是", "暂停"],
    legalName: "王丽",
    confirmation: "您的法定全名是王丽，对吗？",
  },
] as const) {
  test(`${scenario.id} voice-only handoff reaches the next required question`, async ({
    page,
  }) => {
    await installSyntheticGuavaVoice(page, [...scenario.transcripts]);
    await page.route("**/api/interview/extract", async (route) => {
      const request = route.request().postDataJSON() as { turnId: string };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          turnId: request.turnId,
          extraction: {
            summary: `The applicant’s legal name is ${scenario.legalName}.`,
            confirmationText: scenario.confirmation,
            followUpQuestion: "",
            providerListStatus: "unknown",
            facts: [
              {
                kind: "scalar",
                entityKey: "",
                field: "applicant.legalName",
                value: scenario.legalName,
                confidence: 0.99,
                evidenceText: scenario.legalName,
              },
            ],
          },
        }),
      });
    });

    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: scenario.languageButton })
      .click();

    await expect(
      page.getByRole("heading", { name: scenario.nextQuestion }),
    ).toBeVisible();
    await expect(
      page.getByText(scenario.paused, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Conversation language" }),
    ).toHaveValue(scenario.locale);
    expect(await syntheticAnswersRemaining(page)).toBe(0);
  });
}

test("a rejected voice answer becomes a correction turn", async ({ page }) => {
  const transcripts = [
    "I'm ready",
    "Alice Rivera",
    "No, don't save that",
    "Jane Rivera",
    "yes",
    "pause",
  ];
  await installSyntheticGuavaVoice(page, transcripts);
  await page.route("**/api/interview/extract", async (route) => {
    const request = route.request().postDataJSON() as {
      turnId: string;
      transcript: string;
    };
    const legalName = request.transcript.includes("Jane")
      ? "Jane Rivera"
      : "Alice Rivera";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        turnId: request.turnId,
        extraction: {
          summary: `The applicant’s legal name is ${legalName}.`,
          confirmationText: `I heard ${legalName}. Is that correct?`,
          followUpQuestion: "",
          providerListStatus: "unknown",
          facts: [
            {
              kind: "scalar",
              entityKey: "",
              field: "applicant.legalName",
              value: legalName,
              confidence: 0.99,
              evidenceText: legalName,
            },
          ],
        },
      }),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /English EN/i }).click();

  await expect(
    page.getByRole("heading", {
      name: /What is your Social Security number/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Jane Rivera", { exact: true }).first(),
  ).toBeVisible();
  const spokenPrompts = await syntheticSpokenPrompts(page);
  expect(
    spokenPrompts.filter(
      (prompt) => prompt === "What is your full legal name?",
    ),
  ).toHaveLength(1);
  expect(spokenPrompts).toContain(
    "Thanks for catching that. I won’t save it. What should I put down instead?",
  );
  expect(await syntheticAnswersRemaining(page)).toBe(0);
});

test("spoken candidates require confirmation before the next question", async ({ page }) => {
  const transcripts = [
    "I'm ready",
    "Ana Rivera",
    "yes",
    "REDACTED",
    "yes",
    "pause",
  ];
  await installSyntheticGuavaVoice(page, transcripts);
  await page.route("**/api/interview/extract", async (route) => {
    const request = route.request().postDataJSON() as {
      turnId: string;
      topic: string;
    };
    const isName = request.topic === "legal-name";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        turnId: request.turnId,
        extraction: {
          summary: isName ? "Ana Rivera" : "REDACTED",
          acknowledgement: isName
            ? "I have your name as Ana Rivera."
            : "I have those digits.",
          answerComplete: true,
          confirmationText: "",
          followUpQuestion: "",
          providerListStatus: "unknown",
          facts: [
            {
              kind: "scalar",
              entityKey: "",
              field: isName ? "applicant.legalName" : "applicant.ssn",
              value: isName ? "Ana Rivera" : "REDACTED",
              confidence: 0.99,
              evidenceText: isName ? "Ana Rivera" : "REDACTED",
            },
          ],
        },
      }),
    });
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /English EN/i }).click();

  await expect(
    page.getByRole("heading", { name: "What is your date of birth?" }),
  ).toBeVisible();
  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Ana Rivera", { exact: true }).first(),
  ).toBeVisible();
  const spokenPrompts = await syntheticSpokenPrompts(page);
  expect(
    spokenPrompts.some((prompt) =>
      prompt.includes(
        "I heard your full legal name as Ana Rivera. Is that exactly right?",
      ),
    ),
  ).toBe(true);
  expect(
    spokenPrompts.some((prompt) =>
      prompt.includes("I heard: REDACTED. Is that correct?"),
    ),
  ).toBe(true);
  expect(await syntheticAnswersRemaining(page)).toBe(0);
});

test("language is the first decision and removed workflow copy is absent", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page).toHaveTitle("SSDI Agent");
  await expect(
    page.getByRole("heading", {
      name: "Which language would you like to use?",
    }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /English EN/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Español ES/i })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /中文（普通话） 中文/i }),
  ).toBeVisible();

  for (const removed of [
    "Voice-first application",
    "Your voice can complete this application",
    "Start voice check",
    "Start voice interview",
    "Use one-question keyboard fallback",
    "Nothing is saved when this tab closes",
  ]) {
    await expect(page.getByText(removed)).toHaveCount(0);
  }

  const audit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(audit.violations).toEqual([]);
});

test("Spanish selection immediately localizes preparation and fallback", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /Español ES/i }).click();

  await expect(
    page.getByRole("heading", {
      name: /Diga “Estoy listo” o “Estoy lista”/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Le ayudaré a preparar su solicitud por discapacidad/i),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Su respuesta" })).toBeVisible();
  await expect(page.getByText("Permission denied")).toHaveCount(0);
});

test("Mandarin selection keeps the preparation step in Mandarin", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /中文/ }).click();

  await expect(
    page.getByRole("combobox", { name: "Conversation language" }),
  ).toHaveValue("zh-CN");
  await expect(page.getByText("请准备这些资料")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "您的回答" })).toBeVisible();
});

test("typed recovery continues to the first required question", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /English EN/i }).click();
  const answer = page.getByRole("textbox", { name: "Your answer" });
  await expect(answer).toBeVisible();
  await answer.fill("I'm ready");
  await page.getByRole("button", { name: "Send answer" }).click();

  await expect(
    page.getByRole("heading", { name: "What is your full legal name?" }),
  ).toBeVisible();
  await expect(page.getByText("Check")).toHaveCount(0);
  await expect(page.getByText("Review")).toHaveCount(0);
});

async function installSyntheticGuavaVoice(page: Page, transcripts: string[]) {
  // The hook mints its Guava WebRTC code server-side, so stub that route too.
  await page.route("**/api/voice/session", (route) =>
    route.fulfill({
      body: JSON.stringify({
        chatUrl: "wss://localhost/webrtc-chat/",
        socketUrl: "wss://localhost/webrtc/",
        webrtcCode: "grtc-playwright",
      }),
      contentType: "application/json",
      status: 200,
    }),
  );

  await page.addInitScript(({ answers }) => {
    const spoken: string[] = [];

    Object.defineProperty(window, "__SSDI_AGENT_E2E_ANSWERS__", {
      configurable: true,
      value: answers,
    });
    Object.defineProperty(window, "__SSDI_AGENT_E2E_SPOKEN__", {
      configurable: true,
      value: spoken,
    });
    Object.defineProperty(window, "__SSDI_E2E_GUAVA_FACTORY__", {
      configurable: true,
      value: (
        _config: unknown,
        callbacks: {
          onAgentSpeech?: (utterance: {
            id: string;
            role: "agent" | "caller";
            text: string;
          }) => void;
          onCallerSpeech?: (utterance: {
            id: string;
            role: "agent" | "caller";
            text: string;
          }) => void;
          onConnected?: (stream: MediaStream) => void;
        },
      ) => {
        let utterance = 0;
        return {
          close() {},
          async connect() {
            callbacks.onConnected?.({} as MediaStream);
          },
          isConnected: () => true,
          sendText(text: string) {
            spoken.push(text);
            utterance += 1;
            const id = `agent-${utterance}`;
            window.setTimeout(
              () => callbacks.onAgentSpeech?.({ id, role: "agent", text }),
              0,
            );
          },
          setMuted(muted: boolean) {
            if (muted) return;
            window.setTimeout(() => {
              utterance += 1;
              callbacks.onCallerSpeech?.({
                id: `caller-${utterance}`,
                role: "caller",
                text: answers.shift() ?? "pause",
              });
            }, 20);
          },
        };
      },
    });
  }, { answers: transcripts });
}

async function syntheticSpokenPrompts(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & { __SSDI_AGENT_E2E_SPOKEN__?: string[] }
      ).__SSDI_AGENT_E2E_SPOKEN__ ?? [],
  );
}

async function syntheticAnswersRemaining(page: Page) {
  return page.evaluate(
    () =>
      (
        window as typeof window & { __SSDI_AGENT_E2E_ANSWERS__?: string[] }
      ).__SSDI_AGENT_E2E_ANSWERS__?.length ?? 0,
  );
}
