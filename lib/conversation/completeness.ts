import type { ApplicantCase, SupportedLocale } from "@/lib/case/types";
import { collectReviewIssues } from "@/lib/case/review";
import {
  activeQuestions,
  type QuestionDefinition,
} from "@/lib/conversation/questions";
import { localized } from "@/lib/i18n/locales";

export interface CompletionIssue {
  id: string;
  questionId?: string;
  paths: string[];
  severity: "blocking" | "warning";
  message: string;
}

export interface CompletionResult {
  ready: boolean;
  progress: number;
  answered: number;
  total: number;
  blocking: CompletionIssue[];
  warnings: CompletionIssue[];
}

export function evaluateCompleteness(
  applicantCase: ApplicantCase,
  locale: SupportedLocale = applicantCase.conversationLocale ?? "en-US",
): CompletionResult {
  const questions = activeQuestions(applicantCase);
  const answeredQuestions = questions.filter((entry) =>
    entry.isAnswered(applicantCase),
  );
  const blocking = questions
    .filter((entry) => entry.blocksPacket && !entry.isAnswered(applicantCase))
    .map((entry) => questionIssue(entry, locale));
  const warnings = questions
    .filter((entry) => !entry.blocksPacket && !entry.isAnswered(applicantCase))
    .map((entry) => questionIssue(entry, locale, "warning"));

  collectReviewIssues(applicantCase).forEach((issue) => {
    blocking.push({
      id: `${issue.state}:${issue.path}`,
      paths: [issue.path],
      severity: "blocking",
      message:
        issue.state === "conflict"
          ? conflictMessage(locale)
          : unconfirmedMessage(locale),
    });
  });

  if (!applicantCase.finalReviewApproved) {
    blocking.push({
      id: "final-review",
      paths: ["finalReviewApproved"],
      severity: "blocking",
      message: finalReviewMessage(locale),
    });
  }

  const uniqueBlocking = uniqueIssues(blocking);
  const uniqueWarnings = uniqueIssues(warnings);
  return {
    ready: uniqueBlocking.length === 0,
    progress:
      questions.length === 0
        ? 0
        : Math.round((answeredQuestions.length / questions.length) * 100),
    answered: answeredQuestions.length,
    total: questions.length,
    blocking: uniqueBlocking,
    warnings: uniqueWarnings,
  };
}

function questionIssue(
  question: QuestionDefinition,
  locale: SupportedLocale,
  severity: CompletionIssue["severity"] = "blocking",
): CompletionIssue {
  return {
    id: `question:${question.id}`,
    questionId: question.id,
    paths: question.canonicalTargets,
    severity,
    message: localized(question.prompt, locale),
  };
}

function uniqueIssues(issues: CompletionIssue[]): CompletionIssue[] {
  return [
    ...new Map(issues.map((issue) => [issue.id, issue] as const)).values(),
  ];
}

function conflictMessage(locale: SupportedLocale): string {
  return {
    "en-US": "Resolve the conflicting answer before creating documents.",
    "es-US":
      "Resuelva la respuesta contradictoria antes de crear los documentos.",
    "zh-CN": "生成文件前，请解决相互矛盾的回答。",
  }[locale];
}

function finalReviewMessage(locale: SupportedLocale): string {
  return {
    "en-US":
      "Review the completed answers and confirm that they are ready for the documents.",
    "es-US":
      "Revise las respuestas completas y confirme que están listas para los documentos.",
    "zh-CN": "请核对已完成的回答，并确认可以用于生成文件。",
  }[locale];
}

function unconfirmedMessage(locale: SupportedLocale): string {
  return {
    "en-US": "Confirm this answer before creating documents.",
    "es-US": "Confirme esta respuesta antes de crear los documentos.",
    "zh-CN": "生成文件前，请确认这个回答。",
  }[locale];
}
