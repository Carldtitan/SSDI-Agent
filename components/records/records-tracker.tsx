"use client";

import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  Copy,
  FileSignature,
  FolderCheck,
  LoaderCircle,
  Phone,
  PhoneCall,
  ShieldAlert,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useApplicantCase } from "@/components/app/case-context";
import { Button } from "@/components/ui/button";
import { useVoiceTurn } from "@/components/voice/use-voice-turn";
import { parseLocalizedYesNo } from "@/lib/conversation/answers";
import { parseVoiceCommand } from "@/lib/conversation/commands";
import { TRACKER_CONFIG } from "@/lib/rules/config";
import { authorizationWarningDue } from "@/lib/rules/deadlines";
import {
  buildTrackerItems,
  trackerToday,
  type TrackerItem,
} from "@/lib/rules/tracker";
import { cn } from "@/lib/utils";

export function RecordsTracker() {
  const { applicantCase, dispatch, voiceSessionActive } = useApplicantCase();
  const locale = applicantCase.conversationLocale ?? "en-US";
  const voice = useVoiceTurn(locale);
  const voiceStartedRef = useRef(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  const today = trackerToday(applicantCase);
  const items = useMemo(
    () => buildTrackerItems(applicantCase, today),
    [applicantCase, today],
  );
  const authorizationDue = authorizationWarningDue(
    applicantCase.authorization.signedAt,
    today,
    TRACKER_CONFIG,
  );
  const nextAction = items.find(
    (item) =>
      item.action.state === "day_30" || item.action.state === "day_20",
  );
  const received = items.filter(
    (item) => item.action.state === "responded",
  ).length;

  function markReceived(item: TrackerItem) {
    dispatch({
      type: "SET_RECORD_REQUEST",
      request: {
        ...item.request,
        respondedAt: today,
        status: "responded",
      },
    });
  }

  async function continueVoiceRecords() {
    try {
      await voice.activate();
      const summary = recordsSummary(received, items.length, locale);
      setVoiceMessage(summary);
      const answer = await voice.ask(
        `${summary} ${recordsCommandPrompt(locale)}`,
      );
      const command = parseVoiceCommand(answer, locale);
      if (command?.command === "mark_received") {
        const item = findSpokenItem(items, answer) ?? nextAction ?? items[0];
        if (!item) return;
        const confirmation = await voice.ask(
          markReceivedConfirmation(item.request.providerDisplayName, locale),
        );
        const parsed = parseLocalizedYesNo(confirmation, locale);
        if (parsed.ok && parsed.value) {
          markReceived(item);
          setVoiceMessage(
            markedReceivedMessage(
              item.request.providerDisplayName,
              locale,
            ),
          );
          await voice.speak(
            markedReceivedMessage(
              item.request.providerDisplayName,
              locale,
            ),
          );
        }
        return;
      }
      if (
        command?.command === "generate_packet" ||
        /(?:documents|documentos|文件)/i.test(answer)
      ) {
        dispatch({ type: "SET_STAGE", stage: "documents" });
        return;
      }
      if (command?.command === "status") {
        await voice.speak(summary);
        return;
      }
      const item = findSpokenItem(items, answer) ?? nextAction;
      if (item?.action.script) {
        setVoiceMessage(item.action.script);
        await voice.speak(item.action.script);
      }
    } catch (voiceError) {
      setVoiceMessage(
        voiceError instanceof Error
          ? voiceError.message
          : recordsCommandPrompt(locale),
      );
    }
  }

  useEffect(() => {
    if (!voiceSessionActive || voiceStartedRef.current) return;
    voiceStartedRef.current = true;
    void continueVoiceRecords();
    // Voice continuation runs once when Records opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceSessionActive]);

  return (
    <div className="mx-auto w-full max-w-[72rem] pb-24 pt-3 sm:pt-7">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-bold text-primary">Records · Next actions</p>
          <h1 className="mt-2 max-w-[15ch] text-4xl font-bold leading-[1.02] tracking-[-0.045em] sm:text-5xl">
            Keep the evidence moving.
          </h1>
        </div>
        <p className="text-sm font-bold text-muted">
          {received} of {items.length} received
        </p>
      </header>

      {voiceMessage ? (
        <p
          aria-live="polite"
          className="mt-5 inline-flex min-h-10 items-center rounded-full border border-border bg-surface px-4 text-sm font-bold text-muted"
        >
          {voiceMessage}
        </p>
      ) : null}

      {authorizationDue ? (
        <section className="mt-7 flex flex-col gap-4 rounded-[var(--radius-surface)] border border-warning/25 bg-warning-soft p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <FileSignature
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-warning"
            />
            <div>
              <h2 className="font-bold">Your SSA-827 is almost 12 months old</h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                Generate a fresh blank-signature authorization before relying
                on it.
              </p>
            </div>
          </div>
          <Button
            className="shrink-0"
            onClick={() => dispatch({ type: "SET_STAGE", stage: "documents" })}
            size="small"
            variant="secondary"
          >
            Get a fresh SSA-827
          </Button>
        </section>
      ) : null}

      {nextAction ? <NextAction item={nextAction} /> : null}

      <section className="mt-6 overflow-hidden rounded-[var(--radius-surface)] border border-border bg-surface shadow-[0_18px_60px_oklch(0_0_0/0.045)]">
        <header className="border-b border-border px-5 py-4 sm:px-6">
          <h2 className="font-bold">All medical sources</h2>
        </header>
        <div className="divide-y divide-border">
          {items.map((item) => (
            <RecordRow
              item={item}
              key={item.request.id}
              onMarkReceived={() => markReceived(item)}
            />
          ))}
        </div>
      </section>

      <footer className="mt-6 flex flex-col gap-3 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-[42rem] text-sm leading-relaxed text-muted">
          SSDI Agent can call a records office for general process information.
          It never shares your identity or medical details, and you complete
          any verification yourself.
        </p>
        <Button
          onClick={() => dispatch({ type: "SET_STAGE", stage: "documents" })}
          variant="quiet"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to documents
        </Button>
      </footer>
    </div>
  );
}

function NextAction({ item }: { item: TrackerItem }) {
  const urgent = item.action.state === "day_30";
  return (
    <motion.section
      animate={{ y: 0 }}
      className="mt-7 grid overflow-hidden rounded-[var(--radius-surface)] border border-border bg-surface shadow-[0_22px_70px_oklch(0_0_0/0.055)] lg:grid-cols-[minmax(0,1fr)_17rem]"
      initial={{ y: 6 }}
    >
      <div className="p-5 sm:p-7">
        <p
          className={cn(
            "flex items-center gap-2 text-sm font-bold",
            urgent ? "text-danger" : "text-warning",
          )}
        >
          {urgent ? (
            <ShieldAlert aria-hidden="true" className="size-4" />
          ) : (
            <Clock3 aria-hidden="true" className="size-4" />
          )}
          {urgent ? "Deadline passed" : "Follow up now"}
        </p>
        <h2 className="mt-2 text-2xl font-bold tracking-[-0.025em]">
          {item.request.providerDisplayName}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {item.request.portalAvailable
            ? "Check the patient portal first. If the records are not there, call."
            : "No patient portal is listed. Call the records office with the script ready."}
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <a
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-primary px-5 py-2.5 font-bold text-white shadow-[0_8px_24px_oklch(0.46_0.145_356.8/0.16)] transition-colors hover:bg-primary-hover"
            href={`tel:${item.request.providerPhone.replace(/\D/g, "")}`}
          >
            <Phone aria-hidden="true" className="size-4" />
            {item.request.providerPhone}
          </a>
          <CopyScript script={item.action.script ?? ""} />
          <ProviderCallButton item={item} />
        </div>
      </div>
      <div className="border-t border-border bg-surface-subtle/75 p-5 lg:border-l lg:border-t-0 lg:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-muted">
          Request clock
        </p>
        <p className="mt-3 text-3xl font-bold tracking-[-0.04em]">
          Day {item.action.daysSinceRequest}
        </p>
        <p className="mt-1 text-sm text-muted">
          Due {formatDate(item.action.deadline)}
        </p>
        {urgent && item.action.escalationOptions ? (
          <ul className="mt-5 grid gap-2 text-xs leading-relaxed text-muted">
            {item.action.escalationOptions.map((option) => (
              <li className="flex gap-2" key={option}>
                <CircleAlert
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0"
                />
                {option}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </motion.section>
  );
}

function RecordRow({
  item,
  onMarkReceived,
}: {
  item: TrackerItem;
  onMarkReceived: () => void;
}) {
  const [open, setOpen] = useState(false);
  const received = item.action.state === "responded";
  const urgent = item.action.state === "day_30";
  const followUp = item.action.state === "day_20";

  return (
    <article>
      <button
        aria-expanded={open}
        className="grid min-h-[5.4rem] w-full cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 text-left hover:bg-surface-subtle/55 sm:grid-cols-[auto_minmax(0,1fr)_9rem_8rem_auto] sm:px-6"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span
          className={cn(
            "grid size-9 place-items-center rounded-full bg-surface-subtle text-muted",
            received && "bg-success-soft text-success",
            followUp && "bg-warning-soft text-warning",
            urgent && "bg-danger-soft text-danger",
          )}
        >
          {received ? (
            <FolderCheck aria-hidden="true" className="size-4" />
          ) : (
            <Building2 aria-hidden="true" className="size-4" />
          )}
        </span>
        <div className="min-w-0">
          <h3 className="truncate font-bold">
            {item.request.providerDisplayName}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {item.request.portalAvailable
              ? "Patient portal available"
              : "No portal listed"}
          </p>
        </div>
        <p className="hidden text-sm text-muted sm:block">
          {item.request.requestedAt
            ? `Sent ${formatDate(item.request.requestedAt)}`
            : "Not sent"}
        </p>
        <StatusLabel state={item.action.state} />
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "size-4 text-muted transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-border bg-surface-subtle/45 px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <SmallFact label="Requested" value={item.request.requestedAt} />
            <SmallFact label="Deadline" value={item.action.deadline} />
            <SmallFact
              label="Received"
              value={item.request.respondedAt ?? "Not yet"}
            />
          </div>
          {!received ? (
            <div className="mt-5 border-t border-border pt-4">
              <p className="text-sm leading-relaxed text-muted">
                {item.request.portalAvailable
                  ? "Check the patient portal before calling."
                  : "No patient portal is listed. Call the records office."}
              </p>
              {item.action.script ? (
                <blockquote className="mt-4 rounded-[var(--radius-control)] border border-border bg-surface p-4 text-sm leading-relaxed">
                  {item.action.script}
                </blockquote>
              ) : null}
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-2 sm:flex-row">
                  {item.action.script ? (
                    <>
                      <a
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-surface px-3.5 py-2 text-sm font-bold transition-colors hover:border-primary/35 hover:bg-primary-soft/55"
                        href={`tel:${item.request.providerPhone.replace(/\D/g, "")}`}
                      >
                        <Phone aria-hidden="true" className="size-4" />
                        {item.request.providerPhone}
                      </a>
                      <CopyScript script={item.action.script} />
                      <ProviderCallButton item={item} />
                    </>
                  ) : null}
                </div>
                <Button
                  onClick={onMarkReceived}
                  size="small"
                  variant="secondary"
                >
                  <Check aria-hidden="true" className="size-4" />
                  Mark received
                </Button>
              </div>
              {item.action.escalationOptions ? (
                <ul className="mt-4 grid gap-1.5 text-sm text-muted">
                  {item.action.escalationOptions.map((option) => (
                    <li className="flex gap-2" key={option}>
                      <CircleAlert
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0"
                      />
                      {option}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ProviderCallButton({ item }: { item: TrackerItem }) {
  const [status, setStatus] = useState<
    "idle" | "starting" | "started" | "error"
  >("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function callProvider() {
    const confirmed = window.confirm(
      `Start an automated call to ${item.request.providerDisplayName} at ${item.request.providerPhone}? The automated assistant will identify itself and ask only for general records-request instructions. It will not share your identity or medical details.`,
    );
    if (!confirmed) return;

    setStatus("starting");
    setMessage(null);
    try {
      const response = await fetch("/api/records/call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          consent: true,
          providerName: item.request.providerDisplayName,
          providerPhone: item.request.providerPhone,
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error || "The call could not start.");
      setStatus("started");
      setMessage("Call started. The assistant is dialing the records office now.");
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "The call could not start.",
      );
    }
  }

  return (
    <div>
      <Button
        disabled={status === "starting" || status === "started"}
        onClick={callProvider}
        variant="secondary"
      >
        {status === "starting" ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <PhoneCall aria-hidden="true" className="size-4" />
        )}
        {status === "starting"
          ? "Starting call"
          : status === "started"
            ? "Call started"
            : "Let SSDI Agent call"}
      </Button>
      {message ? (
        <p
          aria-live="polite"
          className={cn(
            "mt-2 max-w-64 text-xs leading-relaxed",
            status === "error" ? "text-danger" : "text-muted",
          )}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

function CopyScript({ script }: { script: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button onClick={copy} variant="secondary">
      {copied ? (
        <CheckCircle2 aria-hidden="true" className="size-4 text-success" />
      ) : (
        <Copy aria-hidden="true" className="size-4" />
      )}
      {copied ? "Copied" : "Copy my script"}
    </Button>
  );
}

function StatusLabel({ state }: { state: TrackerItem["action"]["state"] }) {
  const copy = {
    responded: "Received",
    day_30: "Overdue",
    day_20: "Follow up",
    wait: "Waiting",
    portal_first: "Not requested",
  }[state];
  return (
    <span
      className={cn(
        "hidden text-sm font-bold sm:block",
        state === "responded" && "text-success",
        state === "day_20" && "text-warning",
        state === "day_30" && "text-danger",
        (state === "wait" || state === "portal_first") && "text-muted",
      )}
    >
      {copy}
    </span>
  );
}

function SmallFact({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.06em] text-muted">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold">{formatDate(value)}</p>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value || value === "Not yet") return value ?? "Not set";
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function findSpokenItem(items: TrackerItem[], transcript: string) {
  const normalized = transcript.toLocaleLowerCase();
  return items.find((item) => {
    const name = item.request.providerDisplayName.toLocaleLowerCase();
    const meaningfulParts = name
      .replace(/\b(?:dr|doctor|clinic|hospital|medical|center)\b/g, "")
      .split(/\s+/)
      .filter((part) => part.length > 2);
    return (
      normalized.includes(name) ||
      meaningfulParts.some((part) => normalized.includes(part))
    );
  });
}

function recordsSummary(
  received: number,
  total: number,
  locale: "en-US" | "es-US" | "zh-CN",
) {
  return {
    "en-US": `${received} of ${total} medical record requests are complete.`,
    "es-US": `${received} de ${total} solicitudes de expedientes médicos están completas.`,
    "zh-CN": `${total} 项医疗记录申请中已有 ${received} 项完成。`,
  }[locale];
}

function recordsCommandPrompt(locale: "en-US" | "es-US" | "zh-CN") {
  return {
    "en-US":
      "Say a provider name to hear the next action, say mark received and the provider name, or say open documents.",
    "es-US":
      "Diga el nombre de un proveedor para escuchar la próxima acción, diga marcar recibido y el nombre, o diga abrir documentos.",
    "zh-CN":
      "请说出医疗机构名称以听取下一步操作；也可以说“标记为已收到”加机构名称，或说“打开文件”。",
  }[locale];
}

function markReceivedConfirmation(
  providerName: string,
  locale: "en-US" | "es-US" | "zh-CN",
) {
  return {
    "en-US": `Should I mark the records from ${providerName} as received?`,
    "es-US": `¿Debo marcar como recibidos los expedientes de ${providerName}?`,
    "zh-CN": `要将 ${providerName} 的记录标记为已收到吗？`,
  }[locale];
}

function markedReceivedMessage(
  providerName: string,
  locale: "en-US" | "es-US" | "zh-CN",
) {
  return {
    "en-US": `${providerName} is marked received.`,
    "es-US": `${providerName} está marcado como recibido.`,
    "zh-CN": `${providerName} 已标记为收到。`,
  }[locale];
}
