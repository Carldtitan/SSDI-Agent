"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useMemo,
  useReducer,
  useState,
} from "react";

import { createEmptyApplicantCase } from "@/lib/case/empty";
import { caseReducer } from "@/lib/case/reducer";
import type {
  ApplicantCase,
  CaseAction,
} from "@/lib/case/types";

interface CaseContextValue {
  applicantCase: ApplicantCase;
  dispatch: Dispatch<CaseAction>;
  setVoiceSessionActive: (active: boolean) => void;
  voiceSessionActive: boolean;
}

const CaseContext = createContext<CaseContextValue | null>(null);

export function CaseProvider({
  children,
  initialCase,
}: {
  children: ReactNode;
  initialCase?: ApplicantCase;
}) {
  const [applicantCase, dispatch] = useReducer(
    caseReducer,
    initialCase,
    (source) => (source ? structuredClone(source) : createEmptyApplicantCase()),
  );
  const [voiceSessionActive, setVoiceSessionActive] = useState(false);

  const value = useMemo(
    () => ({
      applicantCase,
      dispatch,
      setVoiceSessionActive,
      voiceSessionActive,
    }),
    [applicantCase, voiceSessionActive],
  );

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useApplicantCase(): CaseContextValue {
  const value = useContext(CaseContext);
  if (!value) {
    throw new Error("useApplicantCase must be used inside CaseProvider");
  }
  return value;
}
