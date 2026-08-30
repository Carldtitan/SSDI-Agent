import type {
  AddEntityAction,
  ApplicantCase,
  CanonicalValue,
  CaseAction,
} from "@/lib/case/types";

export function caseReducer(
  state: ApplicantCase,
  action: CaseAction,
): ApplicantCase {
  switch (action.type) {
    case "LOAD_CASE":
      return structuredClone(action.applicantCase);
    case "SET_ELIGIBILITY_INPUT":
      return changed(state, {
        ...state,
        eligibilityInput: { ...state.eligibilityInput, ...action.patch },
      });
    case "ADD_INTERVIEW_TURN":
      return {
        ...state,
        interviewTurns: [...state.interviewTurns, action.turn],
      };
    case "UPDATE_INTERVIEW_TURN":
      return {
        ...state,
        interviewTurns: state.interviewTurns.map((turn) =>
          turn.id === action.turnId ? { ...turn, ...action.patch } : turn,
        ),
      };
    case "ADD_ENTITY":
      return changed(state, addEntity(state, action));
    case "DELETE_ENTITY":
      return changed(state, {
        ...state,
        [action.collection]: state[action.collection].filter(
          (entry) => entry.id !== action.id,
        ),
      });
    case "SET_PROVIDER_COLLECTION_COMPLETE":
      return changed(state, {
        ...state,
        providerCollectionComplete: action.complete,
        collectionCompletion: {
          ...state.collectionCompletion,
          providers: action.complete
            ? state.providers.length
              ? "complete_with_items"
              : "complete_none"
            : state.providers.length
              ? "in_progress"
              : "unanswered",
        },
      });
    case "SET_CONVERSATION_LOCALE":
      return changed(state, {
        ...state,
        conversationLocale: action.locale,
      });
    case "SET_APPLICATION_PHASE":
      return { ...state, applicationPhase: action.phase };
    case "SET_ACTIVE_QUESTION":
      return { ...state, activeQuestionId: action.questionId };
    case "DEFER_QUESTION":
      return {
        ...state,
        deferredItems: [
          ...state.deferredItems.filter(
            (item) => item.questionId !== action.item.questionId,
          ),
          action.item,
        ],
      };
    case "RESOLVE_DEFERRED_QUESTION":
      return {
        ...state,
        deferredItems: state.deferredItems.filter(
          (item) => item.questionId !== action.questionId,
        ),
      };
    case "SET_DOCUMENT_READINESS":
      return {
        ...state,
        documentReadiness: {
          ...state.documentReadiness,
          [action.documentId]: action.status,
        },
      };
    case "SET_COLLECTION_COMPLETION":
      return changed(state, {
        ...state,
        collectionCompletion: {
          ...state.collectionCompletion,
          [action.collection]: action.status,
        },
        providerCollectionComplete:
          action.collection === "providers"
            ? action.status === "complete_none" ||
              action.status === "complete_with_items"
            : state.providerCollectionComplete,
      });
    case "SET_FINAL_REVIEW_APPROVED":
      return changed(state, {
        ...state,
        finalReviewApproved: action.approved,
      });
    case "SET_ADDITIONAL_SSA827":
      return changed(state, {
        ...state,
        authorization: {
          ...state.authorization,
          additionalBlankOriginalRequested: action.requested,
        },
      });
    case "SET_STAGE":
      return { ...state, stage: action.stage };
    case "SET_DOCUMENT_STATE":
      return { ...state, documentState: action.state };
    case "SET_RECORD_REQUEST":
      return changed(state, {
        ...state,
        recordRequests: upsert(state.recordRequests, action.request),
      });
    case "EDIT_VALUE":
      return changed(
        state,
        updateCanonicalAtPath(state, action.path, action.value, "typed"),
      );
    case "CONFIRM_VALUE":
      return changed(state, confirmAtPath(state, action.path));
    case "APPLY_CANDIDATE_PATCH":
      return changed(
        state,
        applyCandidateAtPath(
          state,
          action.patch.path,
          action.patch.value,
          action.patch.confidence,
          action.patch.turnId,
          action.patch.source,
          action.patch.confirmed,
        ),
      );
    default:
      return state;
  }
}

export function isPacketStale(state: ApplicantCase): boolean {
  return (
    state.documentState.generatedRevision !== null &&
    state.documentState.generatedRevision !== state.revision
  );
}

function changed(previous: ApplicantCase, next: ApplicantCase): ApplicantCase {
  return {
    ...next,
    revision: previous.revision + 1,
  };
}

function addEntity(
  state: ApplicantCase,
  action: AddEntityAction,
): ApplicantCase {
  switch (action.collection) {
    case "conditions":
      return { ...state, conditions: [...state.conditions, action.entity] };
    case "providers":
      return { ...state, providers: [...state.providers, action.entity] };
    case "medications":
      return { ...state, medications: [...state.medications, action.entity] };
    case "jobs":
      return { ...state, jobs: [...state.jobs, action.entity] };
    case "marriages":
      return { ...state, marriages: [...state.marriages, action.entity] };
    case "children":
      return { ...state, children: [...state.children, action.entity] };
    case "claimContacts":
      return {
        ...state,
        claimContacts: [...state.claimContacts, action.entity],
      };
    case "medicalTests":
      return { ...state, medicalTests: [...state.medicalTests, action.entity] };
  }
}

function upsert<T extends { id: string }>(items: T[], next: T): T[] {
  return items.some((item) => item.id === next.id)
    ? items.map((item) => (item.id === next.id ? next : item))
    : [...items, next];
}

function updateCanonicalAtPath(
  state: ApplicantCase,
  path: string,
  value: unknown,
  source: "typed" | "voice",
): ApplicantCase {
  return mapPath(state, path, () => ({
    value,
    provenance: {
      source,
      state: "confirmed",
      capturedAt: new Date().toISOString(),
    },
  }));
}

function confirmAtPath(state: ApplicantCase, path: string): ApplicantCase {
  return mapPath(state, path, (current) => ({
    ...current,
    provenance: {
      ...current.provenance,
      state: "confirmed",
    },
    conflictingValues: undefined,
  }));
}

function applyCandidateAtPath(
  state: ApplicantCase,
  path: string,
  value: unknown,
  confidence: number,
  turnId: string,
  source: "typed" | "voice" | "seed",
  confirmed = false,
): ApplicantCase {
  return mapPath(state, path, (current) => {
    if (
      current.provenance.state === "confirmed" &&
      JSON.stringify(current.value) !== JSON.stringify(value)
    ) {
      return {
        ...current,
        provenance: { ...current.provenance, state: "conflict" },
        conflictingValues: [
          ...(current.conflictingValues ?? []),
          { value, source, turnId },
        ],
      };
    }
    return {
      value,
      provenance: {
        source,
        state: confirmed ? "confirmed" : "unconfirmed",
        confidence,
        turnId,
        capturedAt: new Date().toISOString(),
      },
    };
  });
}

function mapPath(
  state: ApplicantCase,
  path: string,
  mapper: (current: CanonicalValue<unknown>) => CanonicalValue<unknown>,
): ApplicantCase {
  const parts = path.split(".");
  const clone = structuredClone(state) as unknown as Record<string, unknown>;
  let cursor: unknown = clone;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    const next = Array.isArray(cursor)
      ? cursor[Number(part)]
      : isRecord(cursor)
        ? cursor[part]
        : undefined;
    if (!next || typeof next !== "object") {
      throw new Error(`Unsupported canonical path: ${path}`);
    }
    cursor = next;
  }
  const key = parts.at(-1);
  if (!key) throw new Error(`Unsupported canonical path: ${path}`);
  if (!isRecord(cursor)) {
    throw new Error(`Unsupported canonical path: ${path}`);
  }
  const current = cursor[key];
  if (!current || typeof current !== "object" || !("provenance" in current)) {
    throw new Error(`Path is not a canonical value: ${path}`);
  }
  cursor[key] = mapper(current as CanonicalValue<unknown>);
  return clone as unknown as ApplicantCase;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
