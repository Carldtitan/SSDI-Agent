"use client";

import {
  ArrowRight,
  Check,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  FolderDown,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
  Volume2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useApplicantCase } from "@/components/app/case-context";
import { Button } from "@/components/ui/button";
import { useVoiceTurn } from "@/components/voice/use-voice-turn";
import { isPacketStale } from "@/lib/case/reducer";
import {
  parseLocalizedYesNo,
} from "@/lib/conversation/answers";
import { evaluateCompleteness } from "@/lib/conversation/completeness";
import { buildDocumentChecklist } from "@/lib/rules/checklist";
import { partitionForForm } from "@/lib/rules/consistency";
import { cn } from "@/lib/utils";

interface PacketDocument {
  id: string;
  name: string;
  detail: string;
}

const baseDocuments: PacketDocument[] = [
  {
    id: "ssa16",
    name: "SSA-16",
    detail: "Application for disability insurance benefits",
  },
  {
    id: "ssa3368",
    name: "SSA-3368",
    detail: "Adult disability report",
  },
  {
    id: "ssa3369",
    name: "SSA-3369",
    detail: "Work history report",
  },
  {
    id: "ssa827",
    name: "SSA-827",
    detail: "One blank-signature authorization",
  },
  {
    id: "evidence",
    name: "Evidence index",
    detail: "Provider requests and deadlines",
  },
];

type GenerationStatus = "idle" | "generating" | "complete" | "failed";
type FolderStatus = "idle" | "creating" | "complete" | "failed";

export function PacketFlow() {
  const { applicantCase, dispatch, voiceSessionActive } = useApplicantCase();
  const locale = applicantCase.conversationLocale ?? "en-US";
  const voice = useVoiceTurn(locale);
  const completion = useMemo(
    () => evaluateCompleteness(applicantCase, locale),
    [applicantCase, locale],
  );
  const checklist = useMemo(
    () => buildDocumentChecklist(applicantCase),
    [applicantCase],
  );
  const hasContinuation =
    partitionForForm(applicantCase.providers, 6).overflow.length > 0 ||
    partitionForForm(applicantCase.medications, 11).overflow.length > 0 ||
    partitionForForm(applicantCase.jobs, 5).overflow.length > 0;
  const documents = [...baseDocuments];
  if (applicantCase.authorization.additionalBlankOriginalRequested) {
    documents.splice(4, 0, {
      id: "ssa827-additional",
      name: "SSA-827",
      detail: "Applicant-requested extra blank original",
    });
  }
  if (hasContinuation) {
    documents.splice(documents.length - 1, 0, {
      id: "continuation",
      name: "Continuation sheet",
      detail: "Every item beyond a form limit",
    });
  }
  const [status, setStatus] = useState<GenerationStatus>("idle");
  const [activeDocument, setActiveDocument] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [summary, setSummary] = useState<{
    pages: number;
    documents: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [folderStatus, setFolderStatus] = useState<FolderStatus>("idle");
  const [folderMessage, setFolderMessage] = useState("");
  const downloadUrlRef = useRef<string | null>(null);
  const voiceBuildStartedRef = useRef(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const stale = isPacketStale(applicantCase);

  useEffect(() => {
    if (status !== "generating") return;
    const timer = window.setInterval(() => {
      setActiveDocument((current) =>
        Math.min(current + 1, documents.length - 1),
      );
    }, 900);
    return () => window.clearInterval(timer);
  }, [documents.length, status]);

  useEffect(
    () => () => {
      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!voiceSessionActive || voiceBuildStartedRef.current) return;
    voiceBuildStartedRef.current = true;
    void continueVoiceBuild();
    // Voice continuation is intentionally triggered once on stage entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionActive]);

  async function continueVoiceBuild() {
    try {
      await voice.activate();
      setVoiceMessage(documentsReadyMessage(locale));
      const permission = await voice.ask(generateConfirmation(locale));
      const parsedPermission = parseLocalizedYesNo(permission, locale);
      if (!parsedPermission.ok || !parsedPermission.value) {
        setVoiceMessage(documentsReadyMessage(locale));
        await voice.speak(generateDeferred(locale));
        return;
      }
      setVoiceMessage(generatingMessage(locale));
      await voice.speak(generatingMessage(locale));
      const generatedUrl = await generatePacket();
      if (!generatedUrl) {
        setVoiceMessage(
          generationFailedMessage(locale),
        );
        await voice.speak(generationFailedMessage(locale));
        return;
      }
      setVoiceMessage(downloadReadyMessage(locale));
      const downloadAnswer = await voice.ask(downloadConfirmation(locale));
      const parsedDownload = parseLocalizedYesNo(downloadAnswer, locale);
      if (parsedDownload.ok && parsedDownload.value) {
        triggerDownload(generatedUrl);
      }
      const recordsAnswer = await voice.ask(recordsConfirmation(locale));
      const parsedRecords = parseLocalizedYesNo(recordsAnswer, locale);
      if (parsedRecords.ok && parsedRecords.value) {
        dispatch({ type: "SET_STAGE", stage: "records" });
      }
    } catch (voiceError) {
      setVoiceMessage(
        voiceError instanceof Error
          ? voiceError.message
          : "Voice control paused. The packet controls still work.",
      );
    }
  }

  async function generatePacket(): Promise<string | null> {
    const readiness = evaluateCompleteness(applicantCase, locale);
    if (!readiness.ready) {
      setStatus("failed");
      setErrorMessage(incompleteDocumentsMessage(locale));
      return null;
    }
    if (downloadUrlRef.current) {
      URL.revokeObjectURL(downloadUrlRef.current);
      downloadUrlRef.current = null;
    }
    setDownloadUrl(null);
    setSummary(null);
    setErrorMessage("");
    setActiveDocument(0);
    setStatus("generating");
    dispatch({
      type: "SET_DOCUMENT_STATE",
      state: { generatedRevision: null, status: "generating" },
    });

    try {
      const response = await fetch("/api/packet/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applicantCase),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          body?.error ??
            "Document generation is unavailable right now. Your answers are still here.",
        );
      }
      const blob = await response.blob();
      const nextDownloadUrl = URL.createObjectURL(blob);
      downloadUrlRef.current = nextDownloadUrl;
      setDownloadUrl(nextDownloadUrl);
      setActiveDocument(documents.length - 1);
      setSummary({
        pages: Number(response.headers.get("x-packet-pages") ?? "0"),
        documents: Number(
          response.headers.get("x-packet-documents") ?? documents.length,
        ),
      });
      setStatus("complete");
      dispatch({
        type: "SET_DOCUMENT_STATE",
        state: {
          generatedRevision: applicantCase.revision,
          status: "complete",
        },
      });
      return nextDownloadUrl;
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Document generation is unavailable right now. Your answers are still here.",
      );
      setStatus("failed");
      dispatch({
        type: "SET_DOCUMENT_STATE",
        state: { generatedRevision: null, status: "failed" },
      });
      return null;
    }
  }

  async function createCaseFolder() {
    if (!window.ssdiAgentDesktop) {
      setFolderStatus("failed");
      setFolderMessage("Open SSDI Agent Desktop to create a Windows case folder.");
      return;
    }
    setFolderStatus("creating");
    setFolderMessage("");
    try {
      const response = await fetch("/api/packet/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(applicantCase),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "SSDI Agent could not prepare the five case documents.");
      }
      const missingDocuments = checklist
        .filter((item) => item.status !== "ready" && item.status !== "obtained")
        .map((item) => ({ label: item.label, reason: item.reason }));
      const result = await window.ssdiAgentDesktop.exportCase({
        archive: await response.arrayBuffer(),
        applicantName: applicantCase.applicant.legalName.value ?? "Applicant",
        missingDocuments,
      });
      if (result.canceled) {
        setFolderStatus("idle");
        return;
      }
      if (!result.ok) throw new Error("SSDI Agent could not create the case folder.");
      setFolderStatus("complete");
      setFolderMessage(
        `${result.formCount ?? 5} generated documents and ${result.evidenceCount ?? 0} supporting files are in ${result.path}.`,
      );
      await voice.speak("Your SSDI Agent case folder is ready and open in File Explorer.");
    } catch (folderError) {
      setFolderStatus("failed");
      setFolderMessage(
        folderError instanceof Error
          ? folderError.message
          : "SSDI Agent could not create the case folder.",
      );
    }
  }

  return (
    <div className="mx-auto w-full max-w-[72rem] pb-24 pt-3 sm:pt-7">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-primary">Documents</p>
          <h1 className="mt-2 max-w-[15ch] text-4xl font-bold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
            Review and download your application documents.
          </h1>
          {voiceSessionActive && voiceMessage ? (
            <p
              aria-live="polite"
              className="mt-4 flex max-w-[40rem] items-center gap-2 text-sm font-bold text-primary"
            >
              <Volume2 aria-hidden="true" className="size-4" />
              {voiceMessage}
            </p>
          ) : null}
        </div>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(17rem,0.75fr)] lg:items-start">
        <section className="overflow-hidden rounded-[var(--radius-surface)] border border-border bg-surface shadow-[0_22px_70px_oklch(0_0_0/0.055)]">
          <div className="relative min-h-[20rem] overflow-hidden border-b border-border bg-surface-subtle/65 p-5 sm:p-8">
            <DocumentStack
              activeDocument={activeDocument}
              complete={status === "complete"}
              generating={status === "generating"}
            />
            <AnimatePresence mode="wait">
              {status === "generating" ? (
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute inset-x-5 bottom-5 rounded-[var(--radius-control)] border border-primary/15 bg-surface/95 p-4 shadow-lg backdrop-blur sm:inset-x-8 sm:bottom-8"
                  exit={{ opacity: 0, y: 8 }}
                  initial={{ opacity: 0, y: 8 }}
                  key="progress"
                >
                  <p
                    aria-live="polite"
                    className="flex items-center gap-2 font-bold"
                  >
                    <LoaderCircle
                      aria-hidden="true"
                      className="size-4 animate-spin text-primary"
                    />
                    Building {documents[activeDocument].name}
                  </p>
                  <div
                    aria-hidden="true"
                    className="mt-3 h-1.5 overflow-hidden rounded-full bg-border"
                  >
                    <motion.div
                      animate={{
                        width: `${((activeDocument + 1) / documents.length) * 100}%`,
                      }}
                      className="h-full rounded-full bg-primary"
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>

          <div className="p-5 sm:p-7">
            <PacketStatus
              downloadUrl={downloadUrl}
              errorMessage={errorMessage}
              stale={stale}
              status={status}
              summary={summary}
            />

            <ol className="mt-6 divide-y divide-border border-y border-border">
              {documents.map((document, index) => {
                const done =
                  status === "complete" ||
                  (status === "generating" && index < activeDocument);
                const active =
                  status === "generating" && index === activeDocument;
                return (
                  <li
                    className="flex min-h-14 items-center gap-3 py-2.5"
                    key={document.id}
                  >
                    <span
                      className={cn(
                        "grid size-8 shrink-0 place-items-center rounded-full border border-border text-muted",
                        done && "border-success/20 bg-success-soft text-success",
                        active && "border-primary/20 bg-primary-soft text-primary",
                      )}
                    >
                      {done ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : active ? (
                        <LoaderCircle
                          aria-hidden="true"
                          className="size-4 animate-spin"
                        />
                      ) : (
                        <FileText aria-hidden="true" className="size-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold">{document.name}</p>
                      <p className="truncate text-xs text-muted">
                        {document.detail}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>

            {status !== "complete" ? (
              <label className="mt-5 flex min-h-11 cursor-pointer items-start gap-3 text-sm leading-relaxed">
                <input
                  checked={
                    applicantCase.authorization
                      .additionalBlankOriginalRequested
                  }
                  className="mt-1 size-4 accent-primary"
                  disabled={status === "generating"}
                  onChange={(event) =>
                    dispatch({
                      type: "SET_ADDITIONAL_SSA827",
                      requested: event.currentTarget.checked,
                    })
                  }
                  type="checkbox"
                />
                <span>
                  <span className="font-bold">
                    Include one extra blank SSA-827 original
                  </span>
                  <span className="block text-muted">
                    Use this only if SSA asked you for another original.
                  </span>
                </span>
              </label>
            ) : null}

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              {status === "complete" && downloadUrl ? (
                <a
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 py-2.5 font-bold text-white shadow-[0_1px_0_oklch(0_0_0/0.12),0_8px_24px_oklch(0.46_0.145_356.8/0.16)] transition-colors hover:bg-primary-hover"
                  download="ssdiAgent-ssdi-application-packet.pdf"
                  href={downloadUrl}
                >
                  <Download aria-hidden="true" className="size-4" />
                  Download packet
                </a>
              ) : (
                <Button
                  disabled={status === "generating" || !completion.ready}
                  onClick={generatePacket}
                >
                  {status === "failed" ? (
                    <RefreshCw aria-hidden="true" className="size-4" />
                  ) : (
                    <Sparkles aria-hidden="true" className="size-4" />
                  )}
                  {status === "failed" ? "Try again" : "Generate packet"}
                </Button>
              )}
              {status === "complete" ? (
                <>
                  <Button
                    disabled={folderStatus === "creating"}
                    onClick={() => void createCaseFolder()}
                    variant="secondary"
                  >
                    {folderStatus === "creating" ? (
                      <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    ) : (
                      <FolderDown aria-hidden="true" className="size-4" />
                    )}
                    {folderStatus === "creating" ? "Creating case folder" : "Create case folder"}
                  </Button>
                  <Button
                    onClick={() => dispatch({ type: "SET_STAGE", stage: "records" })}
                    variant="secondary"
                  >
                    Track medical records
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </Button>
                </>
              ) : null}
            </div>

            {folderMessage ? (
              <p
                aria-live={folderStatus === "failed" ? "assertive" : "polite"}
                className={cn(
                  "mt-4 text-sm font-bold",
                  folderStatus === "failed" ? "text-danger" : "text-success",
                )}
              >
                {folderMessage}
              </p>
            ) : null}

            <p className="mt-4 text-xs leading-relaxed text-muted">
              This is an applicant working copy. Review it, sign where shown,
              and file it yourself. SSDI Agent does not submit forms to
              SSA.
            </p>
            {!completion.ready ? (
              <p className="mt-3 text-sm font-bold text-danger">
                {incompleteDocumentsMessage(locale)}
              </p>
            ) : null}
          </div>
        </section>

        <ChecklistPanel checklist={checklist} />
      </div>
    </div>
  );
}

function DocumentStack({
  activeDocument,
  complete,
  generating,
}: {
  activeDocument: number;
  complete: boolean;
  generating: boolean;
}) {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto h-[17rem] max-w-[27rem]"
    >
      {[2, 1, 0].map((layer) => (
        <motion.div
          animate={{
            rotate: layer === 2 ? -4 : layer === 1 ? 3 : 0,
            y: complete && layer === 0 ? -5 : layer * 7,
          }}
          className={cn(
            "absolute inset-x-6 top-0 h-[16rem] rounded-xl border border-border bg-surface shadow-[0_16px_40px_oklch(0_0_0/0.08)] sm:inset-x-10",
            layer === 1 && "bg-[#fbf8fa]",
            layer === 2 && "bg-[#f3edf0]",
          )}
          key={layer}
          transition={{ type: "spring", stiffness: 180, damping: 22 }}
        >
          {layer === 0 ? (
            <div className="p-6 sm:p-7">
              <div className="flex items-center justify-between">
                <div className="h-2 w-20 rounded-full bg-primary/80" />
                {complete ? (
                  <CheckCircle2 className="size-6 text-success" />
                ) : (
                  <ShieldCheck className="size-6 text-muted/45" />
                )}
              </div>
              <div className="mt-7 h-3 w-3/4 rounded bg-foreground/12" />
              <div className="mt-3 h-2 w-full rounded bg-foreground/8" />
              <div className="mt-2 h-2 w-5/6 rounded bg-foreground/8" />
              <div className="mt-7 grid grid-cols-2 gap-3">
                <div className="h-11 rounded-md border border-border" />
                <div className="h-11 rounded-md border border-border" />
                <div className="col-span-2 h-11 rounded-md border border-border" />
              </div>
              <p className="mt-5 flex items-center gap-2 text-xs font-bold text-muted">
                <FileCheck2 className="size-4" />
                {complete
                  ? "Applicant working packet"
                  : generating
                    ? `Mapping document ${activeDocument + 1}`
                    : "Confirmed facts ready"}
              </p>
              {generating ? (
                <motion.div
                  animate={{ y: [0, 190, 0] }}
                  className="absolute inset-x-2 top-4 h-px bg-primary shadow-[0_0_14px_2px_oklch(0.46_0.145_356.8/0.34)]"
                  transition={{
                    duration: 2.5,
                    ease: "easeInOut",
                    repeat: Infinity,
                  }}
                />
              ) : null}
            </div>
          ) : null}
        </motion.div>
      ))}
    </div>
  );
}

function PacketStatus({
  downloadUrl,
  errorMessage,
  stale,
  status,
  summary,
}: {
  downloadUrl: string | null;
  errorMessage: string;
  stale: boolean;
  status: GenerationStatus;
  summary: { pages: number; documents: number } | null;
}) {
  if (status === "failed") {
    return (
      <div
        className="flex gap-3 rounded-[var(--radius-control)] bg-danger-soft p-4 text-danger"
        role="alert"
      >
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <div>
          <p className="font-bold">Packet not generated</p>
          <p className="mt-0.5 text-sm leading-relaxed">{errorMessage}</p>
        </div>
      </div>
    );
  }
  if (status === "complete" && downloadUrl) {
    return (
      <div aria-live="polite">
        <p className="flex items-center gap-2 font-bold text-success">
          <CheckCircle2 aria-hidden="true" className="size-5" />
          Packet ready
        </p>
        <p className="mt-1 text-sm text-muted">
          {summary?.pages || "All"} pages ·{" "}
          {summary?.documents || 5} documents · one download
        </p>
      </div>
    );
  }
  return (
    <div>
      <p className="font-bold">
        {stale ? "Your packet needs a fresh build" : "Ready to build"}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        Confirmed facts flow into every form. Overflow is carried forward,
        never cut off.
      </p>
    </div>
  );
}

function ChecklistPanel({
  checklist,
}: {
  checklist: ReturnType<typeof buildDocumentChecklist>;
}) {
  return (
    <aside className="rounded-[var(--radius-surface)] border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
          <ShieldCheck aria-hidden="true" className="size-4" />
        </span>
        <div>
          <h2 className="font-bold">Bring with you</h2>
          <p className="text-xs text-muted">Based on this case</p>
        </div>
      </div>
      <ul className="mt-5 divide-y divide-border">
        {checklist.map((item) => (
          <li className="flex gap-3 py-3 first:pt-0" key={item.id}>
            <span
              className={cn(
                "mt-0.5 grid size-5 shrink-0 place-items-center rounded border border-border",
                (item.status === "ready" || item.status === "obtained") &&
                  "border-success/20 bg-success-soft",
                (item.status === "follow_up" ||
                  item.status === "not_available") &&
                  "border-warning/25 bg-warning-soft",
              )}
            >
              {item.status === "follow_up" ||
              item.status === "not_available" ? (
                <TriangleAlert
                  aria-hidden="true"
                  className="size-3 text-warning"
                />
              ) : (
                <Check
                  aria-hidden="true"
                  className={cn(
                    "size-3",
                    item.status === "ready" || item.status === "obtained"
                      ? "text-success"
                      : "text-muted/55",
                  )}
                />
              )}
            </span>
            <div>
              <p className="text-sm font-bold">
                {item.label}
                {item.status === "follow_up" ||
                item.status === "not_available" ? (
                  <span className="ml-2 text-xs text-warning">Find later</span>
                ) : null}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">
                {item.reason}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function triggerDownload(url: string) {
  const link = document.createElement("a");
  link.href = url;
  link.download = "ssdiAgent-ssdi-application-packet.pdf";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function documentsReadyMessage(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US": "Your confirmed answers are ready for the documents.",
    "es-US": "Sus respuestas confirmadas están listas para los documentos.",
    "zh-CN": "您确认的回答已可用于生成文件。",
  }[locale];
}

function generateConfirmation(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US": "Would you like me to create your application documents now?",
    "es-US": "¿Quiere que cree ahora los documentos de su solicitud?",
    "zh-CN": "您要我现在生成申请文件吗？",
  }[locale];
}

function generateDeferred(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US": "Okay. The documents are ready whenever you are.",
    "es-US": "De acuerdo. Los documentos estarán listos cuando usted quiera.",
    "zh-CN": "好的。您准备好后可以随时生成文件。",
  }[locale];
}

function generatingMessage(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US":
      "I am creating the forms, continuation sheets, and evidence index now.",
    "es-US":
      "Estoy creando los formularios, las hojas de continuación y el índice de evidencia.",
    "zh-CN": "正在生成表格、续页和证据索引。",
  }[locale];
}

function generationFailedMessage(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US":
      "The document service did not finish. Your answers are still available.",
    "es-US":
      "El servicio de documentos no terminó. Sus respuestas siguen disponibles.",
    "zh-CN": "文件服务未完成，但您的回答仍然保留。",
  }[locale];
}

function downloadReadyMessage(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US": "Your documents are ready to download.",
    "es-US": "Sus documentos están listos para descargar.",
    "zh-CN": "您的文件已可下载。",
  }[locale];
}

function downloadConfirmation(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US": "Would you like me to download them now?",
    "es-US": "¿Quiere que los descargue ahora?",
    "zh-CN": "现在要下载吗？",
  }[locale];
}

function recordsConfirmation(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US": "Would you like to open the medical records tracker?",
    "es-US": "¿Quiere abrir el seguimiento de expedientes médicos?",
    "zh-CN": "要打开医疗记录跟踪页面吗？",
  }[locale];
}

function incompleteDocumentsMessage(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US":
      "Return to Application and complete the required answers before creating documents.",
    "es-US":
      "Vuelva a Solicitud y complete las respuestas necesarias antes de crear los documentos.",
    "zh-CN": "请返回申请页面，完成必答内容后再生成文件。",
  }[locale];
}
