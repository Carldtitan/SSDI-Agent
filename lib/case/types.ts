export type ConfirmationState =
  | "missing"
  | "unconfirmed"
  | "confirmed"
  | "conflict"
  | "not_applicable";

export type CaptureSource = "voice" | "typed" | "seed";

export type SupportedLocale = "en-US" | "es-US" | "zh-CN";

export type ApplicationPhase =
  | "language"
  | "introduction"
  | "document_readiness"
  | "intake"
  | "issue_resolution"
  | "completion_review"
  | "ready";

export type UserStage = "application" | "documents" | "records";

export type LegacyStage = "check" | "interview" | "review" | "packet";

export type CollectionCompletionState =
  | "unanswered"
  | "in_progress"
  | "complete_none"
  | "complete_with_items";

export type DocumentReadinessState =
  | "ready"
  | "not_available"
  | "follow_up"
  | "obtained";

export interface DeferredItem {
  questionId: string;
  deferredAt: string;
  reason: "unknown" | "come_back_later";
}

export interface Provenance {
  source: CaptureSource;
  state: ConfirmationState;
  capturedAt: string;
  turnId?: string;
  confidence?: number;
}

export interface CanonicalValue<T> {
  value: T | null;
  provenance: Provenance;
  conflictingValues?: Array<{
    value: T;
    source: CaptureSource;
    turnId?: string;
  }>;
}

export interface PostalAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  zip: string;
}

export interface PersonIdentity {
  legalName: CanonicalValue<string>;
  otherNames: CanonicalValue<string[]>;
  ssn: CanonicalValue<string>;
  dateOfBirth: CanonicalValue<string>;
  placeOfBirth: CanonicalValue<string>;
  citizenship: CanonicalValue<string>;
  preferredLanguage: CanonicalValue<string>;
  address: CanonicalValue<PostalAddress>;
  phone: CanonicalValue<string>;
  email: CanonicalValue<string>;
}

export interface EligibilityInput {
  monthlyEarningsUsd: number | null;
  statutorilyBlind: boolean | null;
  impairmentRelatedWorkExpensesUsd: number | null;
  employerSubsidyPossible: boolean | null;
  selfEmployed: boolean | null;
  selfEmploymentProfitUsd: number | null;
  passiveIncomeIncluded: boolean | null;
  conditionExpectedToLast12Months: boolean | null;
  conditionExpectedToResultInDeath: boolean | null;
  dateOfBirth: string | null;
  allegedOnsetDate: string | null;
  estimatedLifetimeCredits: number | null;
  creditsLast3Years: number | null;
  creditsLast10Years: number | null;
  workedYearsAfter21BeforeOnset: number | null;
}

export interface Condition {
  id: string;
  name: CanonicalValue<string>;
  allegedOnsetDate: CanonicalValue<string>;
  symptoms: CanonicalValue<string[]>;
  workEffects: CanonicalValue<string[]>;
}

export interface Provider {
  id: string;
  name: CanonicalValue<string>;
  facility: CanonicalValue<string>;
  specialty: CanonicalValue<string>;
  address: CanonicalValue<PostalAddress>;
  phone: CanonicalValue<string>;
  firstTreatmentDate: CanonicalValue<string>;
  lastTreatmentDate: CanonicalValue<string>;
  nextAppointmentDate: CanonicalValue<string>;
  conditionIds: string[];
}

export interface Medication {
  id: string;
  name: CanonicalValue<string>;
  dosage: CanonicalValue<string>;
  frequency: CanonicalValue<string>;
  prescriberProviderId: CanonicalValue<string>;
  reason: CanonicalValue<string>;
  sideEffects: CanonicalValue<string[]>;
}

export interface PhysicalDemands {
  lifting: string;
  standingHours: number | null;
  walkingHours: number | null;
  sittingHours: number | null;
  climbing: string;
  stooping: string;
  handling: string;
}

export interface Job {
  id: string;
  employer: CanonicalValue<string>;
  title: CanonicalValue<string>;
  startDate: CanonicalValue<string>;
  endDate: CanonicalValue<string>;
  hoursPerDay: CanonicalValue<number>;
  daysPerWeek: CanonicalValue<number>;
  pay: CanonicalValue<number>;
  duties: CanonicalValue<string[]>;
  physicalDemands: CanonicalValue<PhysicalDemands>;
  toolsAndMachines: CanonicalValue<string[]>;
  supervision: CanonicalValue<string>;
  writingAndReports: CanonicalValue<string>;
  reasonEnded: CanonicalValue<string>;
}

export interface Marriage {
  id: string;
  spouseName: CanonicalValue<string>;
  startDate: CanonicalValue<string>;
  endDate: CanonicalValue<string>;
  endReason: CanonicalValue<string>;
}

export interface Child {
  id: string;
  name: CanonicalValue<string>;
  dateOfBirth: CanonicalValue<string>;
  ssn: CanonicalValue<string>;
}

export interface ClaimContact {
  id: string;
  name: CanonicalValue<string>;
  relationship: CanonicalValue<string>;
  address: CanonicalValue<PostalAddress>;
  phone: CanonicalValue<string>;
  speaksEnglish: CanonicalValue<boolean>;
  preferredLanguage: CanonicalValue<string>;
}

export interface MedicalTest {
  id: string;
  type: CanonicalValue<string>;
  bodyPart: CanonicalValue<string>;
  providerOrFacility: CanonicalValue<string>;
  date: CanonicalValue<string>;
}

export interface EducationHistory {
  highestLevel: CanonicalValue<string>;
  completionDate: CanonicalValue<string>;
  schoolName: CanonicalValue<string>;
  schoolAddress: CanonicalValue<PostalAddress>;
  specialEducation: CanonicalValue<boolean>;
  specialEducationDetails: CanonicalValue<string>;
  training: CanonicalValue<string[]>;
  trainingFacility: CanonicalValue<string>;
  trainingFacilityPhone: CanonicalValue<string>;
  trainingFacilityAddress: CanonicalValue<PostalAddress>;
  writtenLanguage: CanonicalValue<string>;
}

export interface InterviewTurn {
  id: string;
  prompt: string;
  transcript: string;
  source: "voice" | "typed" | "demo";
  status: "partial" | "final" | "extracting" | "extracted" | "failed";
  createdAt: string;
  locale?: SupportedLocale;
  canonicalSummary?: string;
}

export type RecordRequestStatus =
  | "not_requested"
  | "sent"
  | "responded"
  | "silent";

export interface RecordRequest {
  id: string;
  providerId: string;
  providerDisplayName: string;
  providerPhone: string;
  portalAvailable: boolean | null;
  requestedAt: string | null;
  extensionNoticeAt: string | null;
  respondedAt: string | null;
  status: RecordRequestStatus;
}

export interface AuthorizationState {
  signedAt: string | null;
  additionalBlankOriginalRequested: boolean;
}

export interface DocumentState {
  generatedRevision: number | null;
  status:
    | "not_started"
    | "ready"
    | "generating"
    | "complete"
    | "partial"
    | "failed";
}

export interface ApplicantCase {
  caseId: string;
  mode: "synthetic_demo" | "session";
  stage: UserStage | LegacyStage;
  conversationLocale: SupportedLocale | null;
  applicationPhase: ApplicationPhase;
  activeQuestionId: string | null;
  deferredItems: DeferredItem[];
  documentReadiness: Record<string, DocumentReadinessState>;
  collectionCompletion: {
    providers: CollectionCompletionState;
    medications: CollectionCompletionState;
    jobs: CollectionCompletionState;
    marriages: CollectionCompletionState;
    children: CollectionCompletionState;
  };
  finalReviewApproved: boolean;
  applicant: PersonIdentity;
  eligibilityInput: EligibilityInput;
  conditions: Condition[];
  providers: Provider[];
  medications: Medication[];
  jobs: Job[];
  marriages: Marriage[];
  children: Child[];
  claimContacts: ClaimContact[];
  medicalTests: MedicalTest[];
  education: EducationHistory;
  servedInMilitary: CanonicalValue<boolean>;
  nonCitizen: CanonicalValue<boolean>;
  workedLastYear: CanonicalValue<boolean>;
  currentlyEarning: CanonicalValue<boolean>;
  bankDetailsReady: CanonicalValue<boolean>;
  otherPublicDisabilityBenefitsFiled: CanonicalValue<boolean>;
  otherPublicDisabilityBenefitTypes: CanonicalValue<string[]>;
  bankRoutingNumber: CanonicalValue<string>;
  bankAccountNumber: CanonicalValue<string>;
  bankAccountType: CanonicalValue<string>;
  directDepositRefused: CanonicalValue<boolean>;
  interviewTurns: InterviewTurn[];
  providerCollectionComplete: boolean;
  recordRequests: RecordRequest[];
  authorization: AuthorizationState;
  documentState: DocumentState;
  revision: number;
}

export type CanonicalCollection =
  | "conditions"
  | "providers"
  | "medications"
  | "jobs"
  | "marriages"
  | "children"
  | "claimContacts"
  | "medicalTests";

export interface CandidatePatch {
  path: string;
  value: unknown;
  confidence: number;
  evidenceText: string;
  turnId: string;
  source: CaptureSource;
  confirmed?: boolean;
}

export type AddEntityAction = {
  [Collection in CanonicalCollection]: {
    type: "ADD_ENTITY";
    collection: Collection;
    entity: ApplicantCase[Collection][number];
  };
}[CanonicalCollection];

export type CaseAction =
  | { type: "SET_ELIGIBILITY_INPUT"; patch: Partial<EligibilityInput> }
  | { type: "ADD_INTERVIEW_TURN"; turn: InterviewTurn }
  | {
      type: "UPDATE_INTERVIEW_TURN";
      turnId: string;
      patch: Partial<InterviewTurn>;
    }
  | { type: "APPLY_CANDIDATE_PATCH"; patch: CandidatePatch }
  | { type: "CONFIRM_VALUE"; path: string }
  | { type: "EDIT_VALUE"; path: string; value: unknown }
  | AddEntityAction
  | { type: "DELETE_ENTITY"; collection: CanonicalCollection; id: string }
  | { type: "SET_PROVIDER_COLLECTION_COMPLETE"; complete: boolean }
  | { type: "SET_CONVERSATION_LOCALE"; locale: SupportedLocale }
  | { type: "SET_APPLICATION_PHASE"; phase: ApplicationPhase }
  | { type: "SET_ACTIVE_QUESTION"; questionId: string | null }
  | { type: "DEFER_QUESTION"; item: DeferredItem }
  | { type: "RESOLVE_DEFERRED_QUESTION"; questionId: string }
  | {
      type: "SET_DOCUMENT_READINESS";
      documentId: string;
      status: DocumentReadinessState;
    }
  | {
      type: "SET_COLLECTION_COMPLETION";
      collection: keyof ApplicantCase["collectionCompletion"];
      status: CollectionCompletionState;
    }
  | { type: "SET_FINAL_REVIEW_APPROVED"; approved: boolean }
  | { type: "SET_ADDITIONAL_SSA827"; requested: boolean }
  | { type: "SET_STAGE"; stage: ApplicantCase["stage"] }
  | { type: "SET_DOCUMENT_STATE"; state: DocumentState }
  | { type: "SET_RECORD_REQUEST"; request: RecordRequest }
  | { type: "LOAD_CASE"; applicantCase: ApplicantCase };
