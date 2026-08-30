# Implementation Plan: Fairy

## Overview

This plan implements Fairy in TypeScript on Next.js (App Router) with Tailwind + shadcn/ui (governed by the Impeccable skill), Inngest, Supabase, and the Grok / Grok Voice adapter with a deterministic Mock_Fallback safety net. It follows the design's "pure core, impure shell" structure: the deterministic rules core (trying-window, missing-data, duration, readiness, extractors) is built and property-tested first, then the data layer, the live Voice_Agent, the event-driven Inngest graph (parallel fan-out/fan-in, a `waitForEvent` approval gate, a `step.sleep` scheduled check-in, and a separate reactive summary function), and the UI are layered on and wired into the sub-three-minute demo path. Property-based tests use `fast-check` + Vitest and each references a numbered design property. All clinical literals come from `/reference-data/`.

## Ownership

Per requirements.md and design.md, Fairy is built by two people working in parallel. Tasks are split as follows. Owner labels apply to the top-level task and all its sub-tasks (including optional `*` test sub-tasks) unless a sub-task is individually labeled.

- **Person A — Product & Data/UI:** Task 1 (project setup), Task 2.2 + 2.3 (validation schemas + test), Task 3 (trying-window), Task 4 (missing-data), Task 5 (duration/readiness), Task 8 (data model + seed), Task 12 (UI shell), Task 13 (intake forms), Task 14 (workspace views), Task 15 (task board), Task 16 (calendar), Task 17 (summary), **Task 21 (parallel-branch WorkflowViewer), Task 22 (live Call Console — transcript + LIVE/FALLBACK indicator), Task 23 (booking approval card UI)**.
- **Person B — Agent & Workflow:** Task 2.1 (reference constants), Task 7 (extractors), Task 9 (Voice agent + Mock_Fallback), Task 10 (Inngest workflow), Task 18 (grounded chat), Task 19 (end-to-end wiring + config/README), **Task 24 (live Grok Voice WebSocket session + adaptive objectives + transcript extraction), Task 25 (event-driven graph: fan-out/fan-in, waitForEvent approval gate, step.sleep check-in, reactive summary function, Workflow_Events)**.
- **Both:** Checkpoints Task 6, Task 11, and Task 20.

> Evolution note (Changes 1–5): Person B's Tasks 9/10 originally built the live-voice **seam** and a linear seven-step workflow. Tasks 24–25 evolve those into a genuine live Grok Voice conversation and the event-driven graph; Tasks 21–23 add the Person-A UI that makes the parallel branches, the LIVE/FALLBACK live transcript, and the human-in-the-loop approval pause visibly demonstrable. New requirements 17, 18, 19, 20 and new correctness properties 27–32 carry the traceability.

Note: Task 2 is split at the sub-task level — 2.1 is owned by Person B while 2.2 and 2.3 are owned by Person A — so its owners are annotated on the sub-tasks rather than the parent.

## Tasks

- [x] 1. Set up project structure and tooling (Owner: Person A)
  - [x] 1.1 Initialize the Next.js app and toolchain
    - Scaffold Next.js (App Router) + TypeScript project with the `app/`, `lib/`, `components/`, and `supabase/` directory layout from the design
    - Add Tailwind CSS and shadcn/ui, the Inngest client dependency, and the Supabase client dependency
    - Configure Vitest and `fast-check` for property-based testing (min 100 generated cases per property)
    - Add `.env.local` handling stubs for `XAI_API_KEY` with `GROK_API_KEY` fallback (no secret values committed)
    - _Requirements: 15.1, 15.2, 15.3, 15.7_

- [ ] 2. Encode reference data and validation (Owner: split — see sub-tasks)
  - [x] 2.1 Build the reference constants layer (Owner: Person B)
    - Create `lib/reference/` typed constants for WHO 2021 limits, female hormone windows/targets, CPT codes, duration rule, clinic slots, and call scripts, sourced verbatim from the files in `/reference-data/`
    - Encode the Seed_Couple "Maya & Daniel" fixture and the mock insurance/clinic responses from `sample-couple.md`, `call-scripts.md`, `insurance-coverage-data.md`, and `clinic-intake-data.md`
    - _Requirements: 12.1, 12.2, 12.3, 11.3_

  - [x] 2.2 Implement intake validation schemas (Owner: Person A)
    - Create `lib/validation/` Zod schemas for Her, His, and Together fields with field names and bounds identical to `sample-couple.md`
    - Enforce enumerations (`semen_analysis_status`, `policy_holder`, `coverage_known`) and WHO 2021 / reference-range bounds; reject out-of-range values with errors naming the field and expected range
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.7, 2.8_

  - [x]* 2.3 Write property test for intake validation (Owner: Person A)
    - **Property 11: Intake validation rejects out-of-range values**
    - **Validates: Requirements 2.7, 2.8**

- [x] 3. Implement the Trying-Window engine (Owner: Person A)
  - [x] 3.1 Implement `lib/core/trying-window.ts`
    - Implement `computeTryingWindow` using only female inputs and the irregular-cycle algorithm; compute confidence/reasons; throw a typed `TryingWindowInputError` on missing/invalid required input while preserving prior state
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7_

  - [x]* 3.2 Write property test for window algebra
    - **Property 1: Trying-window algebraic relationships**
    - **Validates: Requirements 3.1**

  - [x]* 3.3 Write property test for low-confidence reasons
    - **Property 2: Low-confidence reasons when unconfirmed and wide**
    - **Validates: Requirements 3.4, 3.5**

  - [x]* 3.4 Write property test for male-data independence
    - **Property 3: Ovulation timing ignores male data**
    - **Validates: Requirements 3.6**

  - [x]* 3.5 Write property test for invalid-input rejection
    - **Property 4: Trying-window rejects invalid required input**
    - **Validates: Requirements 3.7**

  - [x]* 3.6 Write unit test for the seed-couple worked example
    - Assert fertile window Jun 27 – Jul 18, 2026; priority Jul 2 – Jul 17, 2026; confidence "Low"
    - _Requirements: 3.2, 3.3, 3.4_

- [x] 4. Implement the Missing-Data detector (Owner: Person A)
  - [x] 4.1 Implement `lib/core/missing-data.ts`
    - Apply rule-based checks for day-3 FSH, day-3 estradiol, mid-luteal progesterone, prolactin, each WHO 2021 semen parameter, and insurance coverage status; produce a consolidated checklist of flags with grounded explanations and source file
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x]* 4.2 Write property test for missing-lab flags
    - **Property 5: Missing labs are flagged with grounded explanations**
    - **Validates: Requirements 4.2, 4.3, 4.4**

  - [x]* 4.3 Write property test for semen-parameter flags
    - **Property 6: Semen parameters flagged borderline iff below WHO 2021 limit**
    - **Validates: Requirements 4.5**

  - [x]* 4.4 Write property test for insurance flag
    - **Property 7: Insurance flagged unverified iff not confirmed**
    - **Validates: Requirements 4.6**

  - [x]* 4.5 Write property test for checklist completeness
    - **Property 8: Checklist completeness**
    - **Validates: Requirements 4.1, 4.7**

- [x] 5. Implement the Duration rule and Readiness score (Owner: Person A)
  - [x] 5.1 Implement `lib/core/duration-rule.ts`
    - Apply the age-based threshold (under 35 → 12 months, 35+ → 6 months) and force early evaluation on any red flag
    - _Requirements: 7.4, 7.5, 7.6_

  - [x]* 5.2 Write property test for the age threshold
    - **Property 13: Duration threshold by age**
    - **Validates: Requirements 7.4**

  - [x]* 5.3 Write property test for red-flag override
    - **Property 14: Red flags force early evaluation**
    - **Validates: Requirements 7.5**

  - [x] 5.4 Implement `lib/core/readiness.ts`
    - Implement `applyTaskCompletion` that increases the score on completion and clamps the integer result to [0, 100]
    - _Requirements: 1.4, 5.4_

  - [x]* 5.5 Write property test for readiness bounds
    - **Property 9: Readiness score stays an integer within [0, 100]**
    - **Validates: Requirements 1.4, 5.4**

- [x] 6. Checkpoint - Ensure all rules-core tests pass (Owner: Both)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement structured-result extractors (Owner: Person B)
  - [x] 7.1 Implement `lib/core/extract.ts`
    - Implement insurance and clinic extractors mapping a transcript/mock responses to the exact `call-scripts.md` schemas; assign each created task to exactly one Her/His/Together column; mark unextractable fields unresolved + add a follow-up task while preserving extracted fields
    - _Requirements: 6.2, 6.3, 6.5, 5.2, 5.5_

  - [x]* 7.2 Write property test for task column assignment
    - **Property 10: Every task is assigned to exactly one column**
    - **Validates: Requirements 5.2, 5.5**

  - [x]* 7.3 Write property test for unresolved-field isolation
    - **Property 16: Unresolved fields are isolated**
    - **Validates: Requirements 6.5**

- [x] 8. Implement the data model and seeding (Owner: Person A)
  - [x] 8.1 Create Supabase migrations
    - Define the eight entities (couple, member, her_profile, him_profile, trying_window, task, calendar_event, call_record) with `null` representing MISSING
    - _Requirements: 11.1_

  - [x] 8.2 Implement Supabase client, queries, and seed loader
    - Implement `lib/db/` client and queries; implement the seed loader that writes Maya & Daniel exactly as in `sample-couple.md`; on missing/unparseable seed, refuse partial render and signal a load error
    - _Requirements: 11.2, 11.3, 1.6, 1.7_

  - [x]* 8.3 Write property test for persistence round-trip
    - **Property 20: Persistence round-trip preserves values**
    - **Validates: Requirements 11.3**

  - [x]* 8.4 Write smoke test for seed population
    - Assert migrations create all eight entities and the seed populates `couple_001`
    - _Requirements: 11.1, 11.2_

- [x] 9. Implement the Voice Agent and Mock_Fallback (Owner: Person B)
  - [x] 9.1 Implement `lib/agent/` adapter and Mock_Fallback
    - Implement `runInsuranceCall` / `runClinicCall` that load the authorization packet, ask the 10/7 questions in exact order, produce a chronological transcript + extracted result, decline medical-decision requests, withhold member ID/DOB until verification is requested, and fall through to the deterministic Mock_Fallback on live failure; on clinic completion write back her/his/together tasks, a 2026-06-25 calendar event, and a coverage+appointment+bring-list summary
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.6, 6.7, 6.8, 6.9, 15.5_

  - [x]* 9.2 Write property test for call-output schema
    - **Property 15: Call output conforms to its schema**
    - **Validates: Requirements 6.4**

  - [x]* 9.3 Write property test for Mock_Fallback determinism
    - **Property 17: Mock_Fallback is deterministic**
    - **Validates: Requirements 6.7, 15.5, 16.3**

  - [x]* 9.4 Write property test for identity withholding
    - **Property 18: Identity details withheld until verification requested**
    - **Validates: Requirements 6.8**

  - [x]* 9.5 Write property test for medical-decision declines
    - **Property 19: Medical-decision requests are declined**
    - **Validates: Requirements 6.9**

  - [x]* 9.6 Write unit test for question order and clinic write-back
    - Assert insurance 10-question order, clinic 7-question order, and the Jun 25 event + tasks + summary write-back
    - _Requirements: 6.2, 6.3, 6.6_

- [x] 10. Implement the Inngest seven-step workflow (Owner: Person B)
  - [x] 10.1 Implement `lib/inngest/` client and the 7-step function
    - Implement the function triggered by `fertility.intake.completed`: extract profiles → compute window → detect missing data → check duration rule → generate tasks → run simulated calls → build summary; persist a `pending|running|completed|failed` status per step; on failure mark the step failed, halt later steps, and surface the failed step
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x]* 10.2 Write integration test for workflow orchestration
    - With mocked Grok/agent, assert sequential execution, status enum transitions, and failure halting
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 11. Checkpoint - Ensure core, data, agent, and workflow tests pass (Owner: Both)
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Build the Impeccable UI shell (Owner: Person A)
  - [x] 12.1 Implement phone-frame shell components
    - Build `PhoneFrame` (390px), `BottomTabs` (Home/Calendar/Tasks/Chat), `StickyHeader`, app-like cards, and a single `DisclaimerFooter` line via the Impeccable skill; complete a critique.md pass; no generic Tailwind fallback
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 14.1, 14.2_

  - [x]* 12.2 Write property test for the disclaimer/clutter rule
    - **Property 26: Single disclaimer, no synthetic-data clutter**
    - **Validates: Requirements 14.1, 14.2**

  - [x]* 12.3 Write structural render test for the shell
    - Assert the 390px frame and the four bottom tabs render
    - _Requirements: 13.4_

- [x] 13. Implement the dual intake forms (Owner: Person A)
  - [x] 13.1 Build the Her/His/Together intake forms
    - Render structured fields only, wired to the validation schemas; reject invalid entries inline (retain prior value, name field + range); on both intakes complete and valid, emit `fertility.intake.completed` exactly once
    - _Requirements: 2.1, 2.6, 2.8_

  - [x]* 13.2 Write property test for the completion event
    - **Property 12: Intake completion event fires exactly once**
    - **Validates: Requirements 2.6**

- [x] 14. Implement the Couple Workspace views (Owner: Person A)
  - [x] 14.1 Build Her/His/Together views and the workflow viewer
    - Render the three scoped views (profiles, labs, semen results vs WHO limits, Readiness_Score 0–100, shared insurance/goal/concern/tasks) and the seven-step `WorkflowViewer`; render MISSING values as missing-data flags
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.8, 5.3, 7.2_

  - [x]* 14.2 Write property test for MISSING rendering
    - **Property 24: MISSING values render as flags**
    - **Validates: Requirements 1.8**

- [x] 15. Implement the Task delegation board (Owner: Person A)
  - [x] 15.1 Build the TaskBoard
    - Render exactly three columns (Her/His/Together); create follow-up tasks from extracted call results into a single column each; on extraction failure create no tasks and show a failure indication; on male-track task completion update the Readiness_Score within [0, 100]
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6_

- [x] 16. Implement the Shared Calendar (Owner: Person A)
  - [x] 16.1 Build the CalendarView
    - Display the trying window, priority days, reminders, the Jun 25, 2026 consult, and tasks; show event detail on selection; use the Trying_Window_Engine output as the single source of truth and update when it changes; on unavailable engine output show an error and retain previously loaded data
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x]* 16.2 Write property test for calendar/engine date equality
    - **Property 25: Calendar dates equal engine output**
    - **Validates: Requirements 10.3, 10.4**

- [x] 17. Implement the Doctor-ready Summary (Owner: Person A)
  - [x] 17.1 Build the summary endpoint and UI
    - Assemble both partners' data, trying window + confidence, missing tests, doctor questions, verified coverage facts, and the Jun 25 consult; single-operation copy to clipboard; ground all clinical statements in Reference_Data and omit absent values; label coverage `unverified` and appointment `pending` when applicable
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 18. Implement the Grounded Chat (Owner: Person B)
  - [x] 18.1 Build the chat endpoint and UI
    - Answer the five canonical questions in the fixed order (Short answer → Based on your data → What's uncertain → Shared next step → Sources), each present and non-empty; scope sources to `couple_001` / Reference_Data; state unavailable facts without substitution; provide a deterministic Mock_Fallback when Grok is unavailable
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x]* 18.2 Write property test for summary/chat grounding
    - **Property 21: Summary and chat are grounded in Reference_Data**
    - **Validates: Requirements 8.3, 8.4, 9.4, 12.1, 12.3**

  - [x]* 18.3 Write property test for the five-section format
    - **Property 22: Chat answers use the fixed five-section format**
    - **Validates: Requirements 9.2**

  - [x]* 18.4 Write property test for chat scoping
    - **Property 23: Chat is scoped to the seed couple**
    - **Validates: Requirements 9.3**

- [x] 19. Integration, wiring, and configuration (Owner: Person B)
  - [x] 19.1 Wire the end-to-end demo path
    - Connect intake → workflow → window/missing-data → calls → her/his/together tasks + Jun 25 consult → doctor summary across the UI tabs so the demo runs without orphaned code; ensure live-call failure transparently uses the Mock_Fallback
    - _Requirements: 16.1, 16.3_

  - [x]* 19.2 Write integration test for the demo path
    - With Mock_Fallback, assert intake → workflow → window/missing data → calls → tasks + Jun 25 consult → doctor summary completes
    - _Requirements: 16.1, 16.3_

  - [x] 19.3 Implement config/secrets and README
    - Implement `XAI_API_KEY` → `GROK_API_KEY` resolution falling back to Mock_Fallback when neither is set; configure Vercel deploy; write the README naming xAI, Inngest, Vercel, and Cursor and documenting HIPAA/BAA deferral; exclude Twilio/real telephony/real PHI
    - _Requirements: 15.4, 15.5, 15.6, 15.7, 15.8, 15.9_

  - [x]* 19.4 Write unit test for key resolution
    - Assert correct behavior across all `XAI_API_KEY` / `GROK_API_KEY` presence combinations
    - _Requirements: 15.4_

- [x] 21. Build the parallel-branch WorkflowViewer (Owner: Person A)
  - [x] 21.1 Upgrade `WorkflowViewer` to render the event-driven graph
    - Render concurrent fan-out branches (analyze her | analyze his; insurance call | clinic call) as PARALLEL tracks rather than a single line; render each step status as pending/running/completed/failed/paused; render the booking step as `paused` while it waits at the approval gate; keep the failed-step error indication; built via the Impeccable skill with a critique.md pass, no generic Tailwind fallback
    - Own the `WorkflowStep[]` / branch shape and document the seam for Person B's Inngest status feed (Task 25)
    - _Requirements: 7.2, 20.4, 20.5_

  - [x]* 21.2 Write structural render test for parallel branches and paused status
    - Assert two concurrent branches render side-by-side and a paused step renders with the paused chip
    - _Requirements: 20.4, 20.5_

- [x] 22. Build the live Call Console (Owner: Person A)
  - [x] 22.1 Build `CallConsole` (live transcript + LIVE/FALLBACK indicator + progressive result)
    - Append each agent/human turn to a chronological live transcript as it occurs; show a LIVE indicator while the result is sourced from the Live_Voice_Session and a FALLBACK indicator when the Mock_Fallback is used (bound to `usedFallback`); progressively display each extracted result field as it resolves; consume the agent's `CallOutput` shape (transcript, result, usedFallback) from Person B; built via the Impeccable skill with a critique.md pass
    - _Requirements: 6.10, 20.1, 20.2, 20.3_

  - [x]* 22.2 Write property test for the LIVE/FALLBACK indicator
    - **Property 28 (UI portion): the console shows LIVE iff `usedFallback` is false and FALLBACK iff `usedFallback` is true**
    - **Validates: Requirements 20.2**

  - [x]* 22.3 Write structural test for transcript ordering and progressive fields
    - Assert turns render in chronological order and resolved result fields appear as provided
    - _Requirements: 20.1, 20.3_

- [x] 23. Build the Booking Approval Card (Owner: Person A)
  - [x] 23.1 Build `BookingApprovalCard` and the approval emit seam
    - While the workflow is paused at the gate, show a card stating the agent verified coverage and found the Jun 25 slot and asking the couple to approve; on Approve, emit `couple.booking.approved` exactly once via an injectable emitter seam (default no-op/console; Person B wires it to Inngest `send`); render a "needs approval" state when the gate times out; keep the appointment shown as pending until approval; built via the Impeccable skill with a critique.md pass
    - _Requirements: 17.2, 17.3, 17.5, 20.5_

  - [x]* 23.2 Write property test for the single-emit approval guard
    - **Property 29 (UI portion): tapping Approve emits `couple.booking.approved` exactly once and never re-emits, so the resumed run does not double-book**
    - **Validates: Requirements 17.3, 17.4**

- [ ] 24. Implement the live Grok Voice session and transcript extraction (Owner: Person B)
  - [ ] 24.1 Implement the live Grok Voice WebSocket session in `lib/agent/live.ts`
    - Open the Grok Voice session over `XAI_VOICE_WS_URL` / `XAI_VOICE_MODEL`; speak questions and consume the human's spoken answers in real time; cover the 10 insurance / 7 clinic Call_Objectives adaptively (phrase its own questions from the couple's data + flags, follow up, skip answered, probe vague answers); extract the structured result from the actual live transcript in any order/wording; preserve identity-withholding and medical-decline guardrails; fall through to the deterministic Mock_Fallback ONLY on unavailability/failure/incomplete extraction; set `usedFallback` accordingly
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.7, 6.8, 6.9_

  - [ ]* 24.2 Write property test for live transcript extraction
    - **Property 27: Live call result is parsed from the actual human transcript (any order/wording)**
    - **Validates: Requirements 6.4, 6.5**

  - [ ]* 24.3 Write property test for fallback-only-on-failure determinism
    - **Property 28: Mock_Fallback engages only on live failure and is deterministic (`usedFallback` accurate)**
    - **Validates: Requirements 6.7, 15.5, 16.3**

- [ ] 25. Implement the event-driven Inngest graph (Owner: Person B)
  - [ ] 25.1 Rework `lib/inngest/` into the event-driven graph
    - Replace the linear sequence with: parallel analyze-her | analyze-his (fan-out/fan-in) → window → missing data → duration → tasks → parallel insurance | clinic calls (fan-in) → emit `call.completed` per call → `waitForEvent("couple.booking.approved")` PAUSE (appointment pending; configured timeout → leave pending + "needs approval") → finalize booking + Jun 25 event → `step.sleep` (`CHECKIN_DELAY`) → `checkin.due` → create re-test/lifestyle task + reminder → build/refresh summary; persist per-step status incl. `paused`; finalize at most one booking (no double-book); implement the separate Reactive_Summary_Function listening on `call.completed`
    - _Requirements: 7.1, 7.2, 7.3, 7.7, 7.8, 17.1, 17.3, 17.4, 17.5, 18.1, 18.2, 18.3, 19.1, 19.2, 19.3_

  - [ ]* 25.2 Write integration test for the graph
    - With mocked Grok/agent, assert fan-in ordering (Property 32), `paused`/resume finalizing exactly one booking (Property 29, 30), timeout leaves appointment pending (Property 30), `call.completed` emission, the reactive summary firing (Property 31), and the `step.sleep` check-in task on wake
    - _Requirements: 7.1, 7.7, 7.8, 17.3, 17.4, 17.5, 18.3, 19.3_

  - [ ] 25.3 Update config/secrets for the voice + scheduling env (Owner: Person B)
    - Add `XAI_VOICE_WS_URL`, `XAI_VOICE_MODEL`, and `CHECKIN_DELAY` (e.g. "10s", commented as representing ~72 days) to `.env_example`; ensure the live voice path reads the WS env and the workflow reads `CHECKIN_DELAY`
    - _Requirements: 15.2, 15.10, 18.2_

- [ ] 20. Final checkpoint - Ensure all tests pass (Owner: Both)
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP. They cover property, unit, and integration tests.
- Property tests use `fast-check` + Vitest, run a minimum of 100 generated cases, and each references its design property (format: **Feature: fairy, Property {n}: ...**).
- Each task references specific requirements for traceability; checkpoints ensure incremental validation.
- Latency budgets (≤2s/≤3s/≤10s) and the sub-three-minute demo timing are verified by manual observation during rehearsal, consistent with the design's Testing Strategy.
- All clinical values trace to `/reference-data/`; no medical literals are invented in code.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "3.1", "4.1", "5.1", "5.4", "7.1", "8.1", "12.1"] },
    { "id": 3, "tasks": ["2.3", "3.2", "3.3", "3.4", "3.5", "3.6", "4.2", "4.3", "4.4", "4.5", "5.2", "5.3", "5.5", "7.2", "7.3", "8.2", "9.1", "12.2", "12.3"] },
    { "id": 4, "tasks": ["8.3", "8.4", "9.2", "9.3", "9.4", "9.5", "9.6", "10.1", "13.1", "14.1", "15.1", "16.1", "17.1", "18.1"] },
    { "id": 5, "tasks": ["10.2", "13.2", "14.2", "16.2", "18.2", "18.3", "18.4", "19.1", "19.3", "19.4"] },
    { "id": 6, "tasks": ["19.2"] },
    { "id": 7, "tasks": ["21.1", "22.1", "23.1", "24.1", "25.1", "25.3"] },
    { "id": 8, "tasks": ["21.2", "22.2", "22.3", "23.2", "24.2", "24.3", "25.2"] }
  ]
}
```
