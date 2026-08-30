import { NextResponse } from "next/server";

import {
  extractionRequestSchema,
  interviewExtractionSchema,
} from "@/lib/extraction/schema";
import { generateStructured } from "@/lib/anthropic/structured";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EXTRACTION_SYSTEM_PROMPT = `You extract only explicitly stated facts for an SSDI application-preparation tool.

Rules:
- Never infer or invent a consequential fact.
- Emit no fact when the speaker did not provide a value. Never use an empty value.
- Preserve uncertainty. Approximate dates may be captured only when the speaker says they are approximate.
- The alleged onset date is when a condition began limiting work, not necessarily diagnosis date.
- A provider is a practitioner or facility that treated any reported condition.
- A claimContact is a non-medical person who knows about the applicant's conditions and may help Social Security reach the applicant.
- A medicalTest is a reported or scheduled diagnostic test. Normalize common test names such as MRI/CT scan, X-ray, blood test, vision test, and psychological/IQ test without inventing a test type.
- providerListStatus is complete only when the speaker explicitly says there are no other providers or places of care.
- For applicant, school, and training addresses, emit separate address component facts. Never combine an address into one field.
- For each marriage, child, condition, provider, medication, and job, use one stable entityKey for every fact about that item.
- For jobs, capture the described physical demands, tools, supervision, reports, and reason work ended. Do not turn an unsupported generalization into a number.
- Treat Social Security numbers as strings and preserve leading zeroes and spoken uncertainty.
- For yes/no scalar fields, value must be "yes" or "no" only when the speaker clearly answered.
- If the applicant provides direct-deposit details, emit bankDetailsReady as yes plus bankAccountType, bankRoutingNumber, and bankAccountNumber exactly as spoken. Preserve leading zeroes. If they decline direct deposit, emit directDepositRefused as yes.
- For other public disability programs, emit otherPublicDisabilityBenefitsFiled as yes or no and one otherPublicDisabilityBenefitTypes fact per named program.
- Use one fact per atomic value. Repeated symptoms, duties, or side effects become separate facts with the same entityKey and field.
- entityKey links facts about the same repeated item; use a short stable lowercase name. It is empty only for scalar facts.
- Dates use YYYY-MM-DD only when the speaker gives enough information. Otherwise preserve the spoken date phrase as the value.
- Evidence text must be a short exact excerpt from the transcript.
- Confidence reflects whether the transcript directly supports the value, not whether the value sounds plausible.
- summary must be a concise English statement of the facts that will be stored in English SSA form fields.
- acknowledgement, confirmationText, and followUpQuestion must use the requested conversation language.
- acknowledgement is a warm, factual response of at most twelve words. Do not praise the applicant, use filler, or ask a question.
- confirmationText is a brief, natural readback question in the requested language. State the interpreted value and ask whether it is exactly right. Do not ask for missing details there; use followUpQuestion for missing details.
- answerComplete is true when the latest answer and the supplied conversation context provide enough information to answer the current question.
- When answerComplete is false, followUpQuestion asks one short, specific question that obtains the missing detail. Otherwise followUpQuestion is an empty string.
- Use the supplied conversation history to resolve references such as "that doctor", "the same medicine", or "back then".
- Extract facts explicitly stated in the latest answer. Use history only to resolve references; do not re-emit old facts unless the latest answer corrects or completes them.
- Keep legal names, addresses, identifiers, numbers, and dates exactly as stated. Do not translate them.
- Do not offer legal advice or decide eligibility.
- Return only schema-conforming data.`;

export async function POST(request: Request) {
  const input = extractionRequestSchema.safeParse(await safeJson(request));
  if (!input.success) {
    return noStore(
      NextResponse.json(
        { error: "Add a transcript before extracting facts." },
        { status: 400 },
      ),
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return noStore(
      NextResponse.json(
        { error: "Fact extraction is not configured. Use manual review." },
        { status: 503 },
      ),
    );
  }

  try {
    const extraction = await generateStructured({
      schema: interviewExtractionSchema,
      maxOutputTokens: 2_500,
      systemInstruction: EXTRACTION_SYSTEM_PROMPT,
      timeoutMs: 20_000,
      prompt: `Conversation locale: ${input.data.locale}
Interview topic: ${input.data.topic ?? "general"}
Question asked: ${input.data.prompt ?? "not provided"}

Recent conversation, oldest to newest:
${formatHistory(input.data.history)}

Extract English canonical SSDI application facts from this answer. Confirm the meaning in ${input.data.locale}:

${input.data.transcript}`,
    });

    return noStore(
      NextResponse.json({
        turnId: input.data.turnId,
        extraction,
      }),
    );
  } catch (error) {
    console.error("Interview extraction failed", {
      errorType: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return noStore(
      NextResponse.json(
        {
          error:
            "We kept your transcript, but could not extract facts. Retry or review it manually.",
        },
        { status: 502 },
      ),
    );
  }
}

function formatHistory(
  history: Array<{ role: "assistant" | "user"; content: string }>,
) {
  if (!history.length) return "(No earlier turns.)";
  return history
    .map(
      (message) =>
        `${message.role === "assistant" ? "Assistant" : "Applicant"}: ${message.content}`,
    )
    .join("\n");
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
