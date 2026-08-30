"use client";

import {
  FileStack,
  FolderClock,
  MessageCircleMore,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";

import { GuidedApplication } from "@/components/application/guided-application";
import { BrandMark } from "@/components/app/brand-mark";
import { useApplicantCase } from "@/components/app/case-context";
import { ComputerAssistant } from "@/components/computer/computer-assistant";
import { PacketFlow } from "@/components/packet/packet-flow";
import { RecordsTracker } from "@/components/records/records-tracker";
import type { UserStage } from "@/lib/case/types";
import { copy, localized } from "@/lib/i18n/locales";
import { cn } from "@/lib/utils";

interface StageItem {
  id: UserStage;
  icon: LucideIcon;
}

const stages: StageItem[] = [
  { id: "application", icon: MessageCircleMore },
  { id: "documents", icon: FileStack },
  { id: "records", icon: FolderClock },
];

export function Workspace() {
  const { applicantCase, dispatch } = useApplicantCase();
  const activeStage = normalizeStage(applicantCase.stage);
  const locale = applicantCase.conversationLocale ?? "en-US";
  const activeIndex = stages.findIndex((stage) => stage.id === activeStage);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [activeStage]);

  function navigate(stage: UserStage) {
    const destinationIndex = stages.findIndex((item) => item.id === stage);
    if (destinationIndex <= activeIndex) {
      dispatch({ type: "SET_STAGE", stage });
    }
  }

  return (
    <div
      className={cn(
        "min-h-dvh",
        applicantCase.conversationLocale &&
          "lg:grid lg:grid-cols-[14.5rem_minmax(0,1fr)]",
      )}
    >
      {applicantCase.conversationLocale ? (
        <aside className="hidden border-r border-border bg-surface lg:flex lg:min-h-dvh lg:flex-col lg:p-5">
          <div className="flex items-center gap-3 px-2 py-1">
            <BrandMark />
            <p className="text-lg font-bold leading-none">SSDI Agent</p>
          </div>

          <nav aria-label="Application stages" className="mt-12">
            <ol className="grid gap-1.5">
              {stages.map((stage, index) => {
                const Icon = stage.icon;
                const active = activeStage === stage.id;
                const reachable = index <= activeIndex;
                const complete = index < activeIndex;
                return (
                  <li key={stage.id}>
                    <button
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "flex min-h-12 w-full items-center gap-3 rounded-[var(--radius-control)] px-3 text-left font-bold transition-colors",
                        active && "bg-primary-soft text-primary",
                        !active &&
                          reachable &&
                          "cursor-pointer text-foreground hover:bg-surface-subtle",
                        !reachable && "cursor-not-allowed text-muted/55",
                      )}
                      disabled={!reachable}
                      onClick={() => navigate(stage.id)}
                      type="button"
                    >
                      <span
                        className={cn(
                          "grid size-7 place-items-center rounded-lg",
                          complete && "bg-success-soft text-success",
                          active && "bg-surface text-primary",
                        )}
                      >
                        {complete ? (
                          <ShieldCheck aria-hidden="true" className="size-4" />
                        ) : (
                          <Icon aria-hidden="true" className="size-4" />
                        )}
                      </span>
                      <span>{stageLabel(stage.id, locale)}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>
        </aside>
      ) : null}

      <div className="min-w-0">
        {applicantCase.conversationLocale ? (
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-10">
            <div className="flex items-center gap-2.5 lg:hidden">
              <BrandMark />
              <p className="font-bold">SSDI Agent</p>
            </div>
            <p className="hidden max-w-[48rem] text-sm text-muted lg:block">
              {localized(copy.productDescription, locale)}
            </p>
            {applicantCase.conversationLocale ? (
              <p className="text-xs font-bold text-muted">
                {stageLabel(activeStage, locale)}
              </p>
            ) : null}
          </header>
        ) : null}

        <main
          className={cn(
            "px-4 sm:px-8",
            applicantCase.conversationLocale
              ? "pb-28 pt-5 lg:px-12 lg:pb-12"
              : "pb-10 pt-0 lg:px-12",
          )}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              animate={{ y: 0 }}
              exit={{ y: -4 }}
              initial={{ y: 4 }}
              key={activeStage}
              transition={{ duration: 0.16 }}
            >
              {activeStage === "application" ? <GuidedApplication /> : null}
              {activeStage === "documents" ? <PacketFlow /> : null}
              {activeStage === "records" ? <RecordsTracker /> : null}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {applicantCase.conversationLocale ? (
        <ComputerAssistant locale={locale} />
      ) : null}

      {applicantCase.conversationLocale ? (
        <nav
          aria-label="Application stages"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/97 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur lg:hidden"
        >
          <ol className="grid grid-cols-3">
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const active = activeStage === stage.id;
              const reachable = index <= activeIndex;
              return (
                <li key={stage.id}>
                  <button
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-lg text-[0.6875rem] font-bold",
                      active ? "text-primary" : "text-muted",
                      !reachable && "opacity-45",
                    )}
                    disabled={!reachable}
                    onClick={() => navigate(stage.id)}
                    type="button"
                  >
                    <Icon aria-hidden="true" className="size-5" />
                    {stageLabel(stage.id, locale)}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : null}
    </div>
  );
}

function normalizeStage(
  stage: ReturnType<typeof useApplicantCase>["applicantCase"]["stage"],
): UserStage {
  if (stage === "documents" || stage === "packet") return "documents";
  if (stage === "records") return "records";
  return "application";
}

function stageLabel(stage: UserStage, locale: "en-US" | "es-US" | "zh-CN") {
  if (stage === "application") return localized(copy.application, locale);
  if (stage === "documents") return localized(copy.documents, locale);
  return localized(copy.records, locale);
}
