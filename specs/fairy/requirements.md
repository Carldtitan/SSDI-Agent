# Requirements Document

## Introduction

Fairy is a mobile-first web application for straight couples in the United States who are trying to conceive. Unlike a period tracker, Fairy treats fertility preparation as a shared, two-partner workflow and adds an autonomous agent that handles the phone and paperwork grind: it makes simulated phone calls to insurance and clinics, extracts structured results, and turns them into calendar events and tasks. The product theme is patient agency.

Fairy is built for a one-day Health AI hackathon by two people working in parallel. The application presents as a polished phone app (390px mobile frame, bottom tab navigation, app-like cards, sticky headers), not a desktop dashboard. It uses xAI Grok for reasoning and the Grok Voice Agent API for simulated calls, Inngest for workflow orchestration, Vercel for deployment, Supabase for data, and references Cursor — all named in the README as sponsor tools.

Three rules are non-negotiable and shape every requirement below:
1. **Reference data is the source of truth.** All clinical values, sample patient data, CPT codes, hormone and semen ranges, insurance terms, clinic info, and call scripts come from files in `/reference-data/`. No fabricated medical numbers, details, codes, or dialogue.
2. **All UI uses the Impeccable skill** at `.kiro/skills/impeccable/`. No generic Tailwind fallback. A `critique.md` pass is required before any screen is considered done.
3. **No disclaimer paranoia.** Exactly one small footer disclaimer line, no synthetic-data badges or warnings in the main views.

## Glossary

- **Fairy_System**: The overall Fairy mobile-first web application, including UI, data layer, agent, and workflow.
- **Reference_Data**: The set of files in `/reference-data/` (sample-couple.md, semen-analysis-reference.md, female-hormone-reference.md, cycle-fertility-reference.md, cpt-codes-fertility.md, insurance-coverage-data.md, clinic-intake-data.md, call-scripts.md, README.md) that is the single source of truth for all clinical values, codes, terms, and dialogue.
- **Couple_Workspace**: The shared space where both partners have their own data, scores, and tasks, exposed through Her view, His view, and Together view.
- **Her_View**: The view scoped to the female partner's profile, data, and tasks.
- **His_View**: The view scoped to the male partner's profile, data, and tasks.
- **Together_View**: The view scoped to shared couple data (insurance, goal, top concern, shared tasks).
- **Intake_Form**: A form-based (not conversational) data-entry surface for collecting Her, His, and Together data.
- **Trying_Window_Engine**: The rule-based component that computes the estimated trying window, priority days, and confidence label using the algorithm in cycle-fertility-reference.md.
- **Missing_Data_Detector**: The rule-based component that produces a checklist of missing or borderline data items and explains why each matters.
- **Task_Board**: The Her/His/Together task delegation board.
- **Voice_Agent**: The Grok Voice agent that conducts a real-time, spoken conversation with a live human over a WebSocket to verify insurance and book the clinic. It is given the couple's data and missing-data flags as context and reasons about which objectives to cover, phrasing its own questions, asking follow-ups, skipping answered objectives, and extracting a structured result from the actual live transcript.
- **Live_Voice_Session**: A real-time Grok Voice WebSocket session (configured via `XAI_VOICE_WS_URL` and `XAI_VOICE_MODEL`) in which the Voice_Agent speaks its questions aloud, listens to a human's spoken answers, and responds in real time. During the demo a human presenter plays the insurance rep and the clinic scheduler; there is no second Grok and no scripted bot responder.
- **Call_Objectives**: The 10 insurance and 7 clinic items in call-scripts.md, treated as a checklist of objectives the Voice_Agent must cover (not a verbatim script). insurance-coverage-data.md and clinic-intake-data.md are a cue sheet of suggested facts for the human presenter, not a script for a bot.
- **Mock_Fallback**: The deterministic safety-net responder that engages ONLY when the Live_Voice_Session is unavailable or fails mid-call (e.g., no microphone, bad network, missing key). When live works, results come from the real conversation. Deterministic means identical inputs always yield identical schema and field values, so the demo always completes.
- **Call_Mode**: One of the two Voice_Agent modes, "Insurance verification" or "Clinic booking"; the human presenter switches role between them.
- **Inngest_Workflow**: The event-driven, durable workflow graph triggered by the `fertility.intake.completed` event. It fans out parallel branches, pauses for human approval, and schedules a delayed check-in rather than running as a single linear function.
- **Booking_Approval_Gate**: The `waitForEvent` pause in the Inngest_Workflow that holds after the calls complete and before the clinic appointment is finalized, waiting for a `couple.booking.approved` event (with a configured timeout).
- **Booking_Approval_Card**: The UI card that asks the couple to approve booking the found slot and, on approval, emits `couple.booking.approved` so the same workflow run resumes.
- **Check_In**: The scheduled, delayed male lifestyle/re-test check-in (≈72-day sperm-regeneration horizon) implemented with `step.sleep`/`sleepUntil`, configurable for the demo via `CHECKIN_DELAY`, that wakes to create a re-test task and reminder.
- **Reactive_Summary_Function**: A separate Inngest function that listens for the `call.completed` event and reactively refreshes the Doctor_Summary, decoupled from the main workflow.
- **Workflow_Events**: The events that drive the graph — `fertility.intake.completed` (start), `call.completed` (emitted per completed call), `couple.booking.approved` (resume gate), and `checkin.due` (scheduled wake).
- **Call_Console**: The UI surface that shows the Live_Voice_Session as it happens — the live transcript of agent and human turns, a LIVE vs FALLBACK indicator, and the structured result filling in as the Voice_Agent extracts it.
- **Doctor_Summary**: The copyable, doctor-ready summary grounded only in Reference_Data sources.
- **Grounded_Chat**: The chat feature that answers couple-scoped questions in a fixed structured format with fixed sources.
- **Shared_Calendar**: The calendar showing the trying window, priority days, reminders, booked consult, and tasks.
- **Impeccable_Skill**: The design skill at `.kiro/skills/impeccable/` whose guidance (SKILL.md, layout.md, typeset.md, colorize.md, craft.md, polish.md, delight.md, critique.md) governs all UI.
- **Seed_Couple**: The fictional couple "Maya & Daniel" defined in sample-couple.md used to seed the application.
- **Readiness_Score**: The male partner's numeric readiness score (out of 100) that improves as tasks complete.
- **Trying_Duration_Rule**: The evaluation-timing rule (under 35 → 12 months, 35 or older → 6 months, red flags trigger early evaluation) from cycle-fertility-reference.md.
- **Disclaimer_Line**: The single footer text "Fairy provides educational fertility information, not medical advice."

## Requirements

### Requirement 1: Couple Workspace (F1)

**User Story:** As a couple trying to conceive, we want a single shared workspace with separate Her, His, and Together views, so that both partners can contribute and see data without one-way sharing.

#### Acceptance Criteria

1. THE Fairy_System SHALL present exactly one Couple_Workspace that contains exactly three named views: Her_View, His_View, and Together_View.
2. THE Fairy_System SHALL grant the female partner edit ownership of her own data, grant the male partner edit ownership of his own data, and grant both partners shared read access to Her_View, His_View, and Together_View.
3. WHEN a user selects Her_View, THE Fairy_System SHALL display the female partner's profile, labs, and tasks within 2 seconds.
4. WHEN a user selects His_View, THE Fairy_System SHALL display the male partner's semen analysis results, lifestyle factors, Readiness_Score expressed as an integer from 0 to 100, and tasks within 2 seconds.
5. WHEN a user selects Together_View, THE Fairy_System SHALL display the shared couple data, including insurance provider, insurance plan, coverage status, goal, top concern, and shared tasks, within 2 seconds.
6. THE Fairy_System SHALL seed the Couple_Workspace from the Seed_Couple defined in sample-couple.md.
7. IF the seed data is missing or cannot be parsed, THEN THE Fairy_System SHALL NOT render a partial Couple_Workspace and SHALL display an error indication that the workspace cannot be loaded.
8. WHERE a seed lab or test value is "MISSING", THE Fairy_System SHALL display that value as a missing-data flag rather than as a blank field or a substituted value.

### Requirement 2: Dual Intake Forms (F2)

**User Story:** As each partner, I want a form to enter my own fertility data, so that the application has complete data for both of us.

#### Acceptance Criteria

1. THE Intake_Form SHALL collect Her data using structured fields only, with no free-text dialog.
2. THE Intake_Form SHALL collect the Her fields: age, last period start date, average cycle length within the range 45 to 60 days, cycle regularity, months trying, conditions, prior medications, ovulation tracking method, and prior pregnancies.
3. THE Intake_Form SHALL collect the His fields: age, semen analysis status as one of the enumerated values not_started, in_progress, or completed, semen analysis results validated against the WHO 2021 lower reference limits (sperm concentration 16 million/mL, total sperm number 39 million/ejaculate, progressive motility 30%, normal morphology 4%), lifestyle factors (smoking, alcohol, heat exposure, sleep, stress, BMI, supplements), and medical history.
4. THE Intake_Form SHALL collect the Together fields: insurance provider, member ID, group number, policy holder as one of the enumerated values her or him, coverage known status as one of the enumerated values confirmed, partial_unconfirmed, or unconfirmed, goal, and top concern.
5. THE Intake_Form SHALL use field names and value bounds identical to those defined in sample-couple.md.
6. WHEN both partners' intake is complete and valid, THE Fairy_System SHALL emit the `fertility.intake.completed` event exactly once.
7. WHERE a clinical field has a defined reference range in Reference_Data, THE Intake_Form SHALL validate the entered value against that reference range.
8. IF an entered value is out of range or invalid, THEN THE Intake_Form SHALL reject the value, retain the prior value, and display an error indication that names the invalid field and its expected range.

### Requirement 3: Trying-Window and Confidence (F3)

**User Story:** As a couple, we want an estimated trying window with a confidence label, so that we know which days to prioritize and how reliable the estimate is.

#### Acceptance Criteria

1. THE Trying_Window_Engine SHALL compute the trying window from the required inputs lastPeriodStart, cycleLengthMin in days, and cycleLengthMax in days, producing calendar-date outputs using the irregular-cycle algorithm defined in cycle-fertility-reference.md: minOvulation = lastPeriodStart + cycleLengthMin − 14; maxOvulation = lastPeriodStart + cycleLengthMax − 14; fertileWindowStart = minOvulation − 5; fertileWindowEnd = maxOvulation + 1.
2. WHEN the Trying_Window_Engine processes the Seed_Couple data, THE Trying_Window_Engine SHALL output an estimated trying window with fertileWindowStart of June 27, 2026 and fertileWindowEnd of July 18, 2026.
3. WHEN the Trying_Window_Engine processes the Seed_Couple data, THE Trying_Window_Engine SHALL output priority days with minOvulation of July 2, 2026 and maxOvulation of July 17, 2026.
4. WHEN the Trying_Window_Engine processes the Seed_Couple data, THE Trying_Window_Engine SHALL output a confidence label with the exact value "Low".
5. IF ovulation is not confirmed (no mid-luteal progesterone result and no LH confirmation) and the cycle range is wide (cycleLengthMax minus cycleLengthMin greater than 7 days), THEN THE Trying_Window_Engine SHALL display the three reasons with the exact strings "irregular cycle", "ovulation not confirmed", and "wide cycle range".
6. THE Trying_Window_Engine SHALL compute ovulation timing using only the female partner's lastPeriodStart, cycleLengthMin, and cycleLengthMax, and SHALL exclude all male partner data from ovulation timing.
7. IF a required input (lastPeriodStart, cycleLengthMin, or cycleLengthMax) is missing or invalid, THEN THE Trying_Window_Engine SHALL display an error indication and SHALL preserve the prior state.

### Requirement 4: Missing-Data Detector (F4)

**User Story:** As a couple, we want a checklist of missing or borderline data with explanations, so that we know what tests to complete before care.

#### Acceptance Criteria

1. THE Missing_Data_Detector SHALL apply rule-based checks against the seed labs in Reference_Data for the following items: day-3 FSH, day-3 estradiol, mid-luteal progesterone, prolactin, each WHO 2021 semen analysis parameter, and insurance coverage status.
2. IF day-3 FSH or day-3 estradiol is absent (value null) in the female labs, THEN THE Missing_Data_Detector SHALL flag each absent item as missing and present an explanation that the item must be drawn on cycle day 2–3 for ovarian-reserve assessment as defined in female-hormone-reference.md.
3. IF mid-luteal progesterone is absent (value null), THEN THE Missing_Data_Detector SHALL flag the item as missing and indicate that ovulation cannot be confirmed without a mid-luteal progesterone result (rise toward the ≈10 ng/mL ovulation-indicative level per female-hormone-reference.md).
4. IF prolactin is absent (value null), THEN THE Missing_Data_Detector SHALL flag the item as missing and present an explanation that prolactin is part of the pituitary/ovulation screen per female-hormone-reference.md.
5. WHEN a semen analysis parameter is below its WHO 2021 lower reference limit defined in semen-analysis-reference.md (semen volume 1.4 mL, sperm concentration 16 million/mL, total sperm number 39 million/ejaculate, total motility 42%, progressive motility 30%, vitality 54%, normal morphology 4%, pH 7.2), THE Missing_Data_Detector SHALL flag that parameter as borderline and recommend one repeat semen analysis collected after 2–7 days of abstinence.
6. IF insurance coverage status is not equal to "confirmed" (including unconfirmed or partial states such as the seed couple's partial_unconfirmed in sample-couple.md), THEN THE Missing_Data_Detector SHALL flag insurance coverage as unverified and indicate that verification is required before care.
7. WHEN all rule-based checks in criterion 1 have completed, THE Missing_Data_Detector SHALL produce a consolidated checklist that lists each flagged missing item and each flagged borderline item together with its corresponding explanation.

### Requirement 5: Task Delegation Board (F5)

**User Story:** As a couple, we want tasks split across Her, His, and Together columns, so that responsibilities are shared rather than falling on one partner.

#### Acceptance Criteria

1. THE Task_Board SHALL present exactly three columns labeled Her, His, and Together.
2. WHEN the Voice_Agent extracts a structured result from a completed phone call, THE Task_Board SHALL create one or more follow-up tasks from that result and assign each created task to exactly one of the Her, His, or Together columns.
3. THE His_View SHALL include a male track containing his own semen analysis status and results compared against the WHO 2021 reference limits, a lifestyle checklist covering heat exposure, smoking, alcohol, sleep, stress, and BMI tracked over a 72-day horizon (approximately 10 to 12 weeks), the insurance-verification and clinic-booking phone calls, bringing required records (semen analysis, prior labs, and urology note) to the consult, and a Readiness_Score expressed as an integer from 0 to 100.
4. WHEN a male track task is marked completed, THE Fairy_System SHALL increase the Readiness_Score and SHALL keep the resulting value within the range 0 to 100 inclusive.
5. THE Task_Board SHALL assign each task to exactly one of the Her, His, or Together columns.
6. IF the Voice_Agent fails to extract a structured result from a phone call, THEN THE Task_Board SHALL NOT create tasks from that call and SHALL display an indication that result extraction failed.

### Requirement 6: Grok Voice Agent — Live Agentic Calls (F6)

**User Story:** As a couple, we want an agent to actually talk to the insurance rep and the clinic for us in real time, so that we avoid the phone-and-paperwork grind.

#### Acceptance Criteria

1. THE Voice_Agent SHALL load the authorization packet fields defined in call-scripts.md before any call: caller_identity, patient_names, dob (her and him), insurance (provider, member_id, group_number, policy_holder), call_objective, and guardrails.
2. WHEN the Voice_Agent starts a call in either Call_Mode, THE Voice_Agent SHALL open a Live_Voice_Session over the Grok Voice WebSocket configured by `XAI_VOICE_WS_URL` and `XAI_VOICE_MODEL`, speak its questions aloud, and listen to and respond to the live human's spoken answers in real time.
3. THE Voice_Agent SHALL treat the 10 insurance Call_Objectives and the 7 clinic Call_Objectives in call-scripts.md as a checklist of objectives rather than a verbatim script, phrasing each question itself from the couple's data and missing-data flags, asking follow-ups based on what the human actually says, skipping objectives already answered, and probing further on vague answers.
4. WHEN the Voice_Agent completes a call, THE Voice_Agent SHALL produce a transcript of chronological agent and human turns and SHALL extract a structured result from that actual live transcript conforming to the schema defined for that Call_Mode in call-scripts.md — the insurance result fields (diagnostic_covered, semen_analysis_covered, hormone_labs_covered, prior_auth_required_for, in_network_lab, deductible, coinsurance_pct, oop_max, referral_required, follow_up_tasks) or the clinic result fields (booked {date, time, mode, clinic}, bring_list, tasks {her, him, together}, calendar_event).
5. WHEN the Voice_Agent extracts the structured result, THE Voice_Agent SHALL parse the human's answers regardless of the order or wording in which they are given, and IF a defined result field cannot be extracted, THEN THE Voice_Agent SHALL mark that field unresolved, add a follow-up task to obtain it, and preserve all other extracted fields.
6. WHEN the Voice_Agent completes the clinic booking call, THE Voice_Agent SHALL write back the her, his, and together tasks, a calendar event dated 2026-06-25, and a summary containing the coverage facts, the appointment, and the bring-list.
7. IF the Live_Voice_Session is unavailable or fails at any point (no key, no microphone, bad network, or mid-call error), THEN THE Voice_Agent SHALL fall through to the deterministic Mock_Fallback, where deterministic means the Mock_Fallback returns the same schema and the same field values across repeated runs with identical inputs; the Mock_Fallback SHALL engage ONLY on such live failure.
8. WHILE a call is in progress and the human has not requested identity verification, THE Voice_Agent SHALL withhold the member ID and date of birth, and SHALL disclose them only after the human requests identity verification, per the call-scripts.md guardrails.
9. IF the human requests a medical decision or acceptance of treatment on the couple's behalf, THEN THE Voice_Agent SHALL decline the request and add a follow-up task for the couple to address it.
10. WHILE a call is in progress, THE Fairy_System SHALL display the Call_Console showing the live transcript of agent and human turns as they occur, a LIVE versus FALLBACK indicator reflecting whether the result came from the Live_Voice_Session or the Mock_Fallback, and the structured result fields filling in as the Voice_Agent extracts them.

### Requirement 7: Inngest Workflow — Event-Driven Reactive Graph (F7)

**User Story:** As a demo audience, we want to see a durable, event-driven workflow with parallel branches, a human approval pause, and a scheduled follow-up, so that the agentic orchestration is visibly more than a one-shot function.

#### Acceptance Criteria

1. WHEN the `fertility.intake.completed` event fires, THE Inngest_Workflow SHALL run the following graph: (a) analyze-her-data and analyze-his-data as two concurrent steps that fan out and then join (fan-in) before any later step proceeds; (b) compute trying window; (c) detect missing data; (d) check trying-duration rule; (e) generate her/his/together tasks; (f) the insurance call and the clinic call as two parallel steps that both must complete before the workflow proceeds; (g) finalize booking and the June 25 calendar event; (h) build/refresh the doctor summary.
2. THE Inngest_Workflow SHALL persist and display the status of each step in the UI as one of the enumerated values pending, running, completed, failed, or paused.
3. IF a step fails, THEN THE Inngest_Workflow SHALL mark that step failed, halt the steps that depend on it, and display an error indication identifying the failed step.
4. WHEN the trying-duration step runs, THE Inngest_Workflow SHALL apply the Trying_Duration_Rule: a female partner under 35 (age strictly less than 35) uses a 12-month threshold and a female partner 35 or older (age 35 or greater) uses a 6-month threshold.
5. IF any red-flag condition is present (irregular or absent periods, known PCOS or endometriosis, prior pelvic surgery, or known male factor as defined in cycle-fertility-reference.md), THEN THE Inngest_Workflow SHALL recommend early evaluation regardless of the trying-duration threshold.
6. WHEN the Inngest_Workflow processes the Seed_Couple data, THE Inngest_Workflow SHALL apply the 12-month threshold because the female partner is 33 (less than 35), record 8 months trying, and recommend early evaluation due to the red flags of irregular cycles and borderline semen analysis per sample-couple.md.
7. WHEN each call step completes, THE Inngest_Workflow SHALL emit a `call.completed` event carrying that call's result.
8. THE analyze-her-data and analyze-his-data fan-out branches SHALL both reach completed status before the compute-trying-window step starts, and the insurance-call and clinic-call branches SHALL both reach completed status before the Booking_Approval_Gate is entered.

### Requirement 8: Doctor-Ready Summary (F8)

**User Story:** As a couple, we want a copyable doctor-ready summary, so that we enter the first appointment prepared.

#### Acceptance Criteria

1. THE Doctor_Summary SHALL include the following sections: both partners' data, the trying window and confidence label sourced from the Trying_Window_Engine, the missing tests sourced from the Missing_Data_Detector, questions for the doctor, verified coverage facts, and the booked consult on June 25, 2026.
2. WHEN a user invokes the copy action, THE Doctor_Summary SHALL place the complete text of all sections onto the clipboard in a single operation.
3. THE Doctor_Summary SHALL ground all clinical statements and citations only in sources cited within Reference_Data.
4. IF a clinical value or citation is not present in Reference_Data, THEN THE Doctor_Summary SHALL omit that value or citation.
5. IF insurance coverage is not verified, THEN THE Doctor_Summary SHALL label coverage as unverified (the seed couple's coverage_status is partial_unconfirmed in sample-couple.md).
6. IF the appointment is not booked, THEN THE Doctor_Summary SHALL indicate the appointment as pending.

### Requirement 9: Grounded Chat (F9)

**User Story:** As a couple, we want to ask questions and get answers scoped to our data, so that we understand our situation and next steps.

#### Acceptance Criteria

1. THE Grounded_Chat SHALL answer at least five questions: why these days are priority, what the partner should do this week, why confidence is low, what to ask the doctor, and what data is missing.
2. WHEN the Grounded_Chat answers a question, THE Grounded_Chat SHALL respond within 10 seconds in the fixed order Short answer, Based on your data, What's uncertain, Shared next step, and Sources, with every one of the five sections present and non-empty.
3. THE Grounded_Chat SHALL draw sources only from the single Seed_Couple couple_001 in Reference_Data, SHALL cite the source for each answer, and SHALL exclude any other couple's data.
4. IF a requested fact is not present in Reference_Data, THEN THE Grounded_Chat SHALL state that the information is unavailable and SHALL NOT provide a substitute value.

### Requirement 10: Shared Calendar (F10)

**User Story:** As a couple, we want a shared calendar with our window, priority days, reminders, and booked consult, so that we coordinate timing in one place.

#### Acceptance Criteria

1. WHEN the Shared_Calendar is opened, THE Shared_Calendar SHALL display the trying window, priority days, reminders, the booked consult on June 25, 2026, and tasks within 3 seconds.
2. WHEN a user selects a calendar event, THE Shared_Calendar SHALL display the event detail, including the event title, date, time, and description, within 2 seconds.
3. THE Shared_Calendar SHALL use the same trying-window and priority-day dates produced by the Trying_Window_Engine as the single source of truth.
4. WHEN the Trying_Window_Engine updates the trying-window or priority-day dates, THE Shared_Calendar SHALL update the displayed dates to match the new Trying_Window_Engine output.
5. IF the Trying_Window_Engine output is unavailable when the Shared_Calendar is opened, THEN THE Shared_Calendar SHALL display an error indication that the trying-window and priority-day dates cannot be loaded, and SHALL retain any previously loaded calendar data.

### Requirement 11: Data Model and Seeding

**User Story:** As a developer, I want a defined Supabase data model seeded from the sample couple, so that the application runs with realistic data without live entry during the demo.

#### Acceptance Criteria

1. THE Fairy_System SHALL define the data entities: couple, member, her_profile, him_profile, trying_window, task, calendar_event, and call_record.
2. THE Fairy_System SHALL seed the data model from the Seed_Couple defined in sample-couple.md.
3. THE Fairy_System SHALL store all seeded clinical values exactly as defined in Reference_Data.

### Requirement 12: Reference Data as Source of Truth (Non-Negotiable Rule 1)

**User Story:** As a clinical-integrity stakeholder, I want all medical content to come from reference data, so that no values are fabricated.

#### Acceptance Criteria

1. THE Fairy_System SHALL source all clinical values, sample patient data, CPT codes, hormone and semen ranges, insurance terms, clinic info, and call scripts from Reference_Data.
2. IF a required clinical value is absent from Reference_Data, THEN THE Fairy_System SHALL require the value to be added to Reference_Data with a source before use.
3. THE Fairy_System SHALL exclude any fabricated medical numbers, details, codes, or dialogue.

### Requirement 13: Impeccable Design Skill (Non-Negotiable Rule 2)

**User Story:** As a design stakeholder, I want all UI built with the Impeccable skill, so that the interface is polished and consistent.

#### Acceptance Criteria

1. THE Fairy_System SHALL build all UI and design using the Impeccable_Skill guidance at `.kiro/skills/impeccable/`.
2. THE Fairy_System SHALL exclude generic Tailwind fallback designs.
3. THE Fairy_System SHALL complete a critique.md pass for each screen before that screen is considered done.
4. THE Fairy_System SHALL present the UI as a phone app with a 390px mobile frame, bottom tab navigation (Home, Calendar, Tasks, Chat), app-like cards, and sticky headers.

### Requirement 14: Single Footer Disclaimer (Non-Negotiable Rule 3)

**User Story:** As a user, I want one clear disclaimer without clutter, so that the interface stays clean and trustworthy.

#### Acceptance Criteria

1. THE Fairy_System SHALL display exactly one Disclaimer_Line reading "Fairy provides educational fertility information, not medical advice." in the footer.
2. THE Fairy_System SHALL exclude synthetic-data badges and warnings from the main views.

### Requirement 15: Sponsor Tools, Stack, and Deployment

**User Story:** As a hackathon participant, I want the required stack and sponsor tools used and named, so that the project qualifies and is reproducible.

#### Acceptance Criteria

1. THE Fairy_System SHALL be built with Next.js App Router, TypeScript, Tailwind, and shadcn/ui.
2. THE Fairy_System SHALL use xAI Grok for reasoning and the Grok Voice Agent API for live calls, opening the Grok Voice WebSocket session via `XAI_VOICE_WS_URL` and `XAI_VOICE_MODEL`.
3. THE Fairy_System SHALL use Inngest for workflow orchestration and Supabase for data storage.
4. THE Fairy_System SHALL read the Grok API key from `XAI_API_KEY` in `.env.local` and SHALL fall back to `GROK_API_KEY` when `XAI_API_KEY` is absent.
5. WHEN any Grok or Grok Voice call is made, THE Fairy_System SHALL provide a deterministic Mock_Fallback that engages only on live failure so the demo continues without interruption.
6. THE Fairy_System SHALL exclude Twilio, real telephony, and real PHI.
7. THE Fairy_System SHALL run locally and deploy on Vercel.
8. THE Fairy_System SHALL name the sponsor tools xAI, Inngest, Vercel, and Cursor in the README.
9. THE Fairy_System SHALL document deferral of HIPAA compliance to production with a signed BAA in the README.
10. THE Fairy_System SHALL read the Check_In delay from the `CHECKIN_DELAY` environment variable (e.g., "10s" for the demo, representing the ~72-day horizon), and SHALL document `XAI_VOICE_WS_URL`, `XAI_VOICE_MODEL`, and `CHECKIN_DELAY` in `.env_example`.

### Requirement 16: Working Demo Path

**User Story:** As a presenter, I want a reliable sub-three-minute demo path, so that the build can be shown end to end by hour four.

#### Acceptance Criteria

1. THE Fairy_System SHALL support a demo path in which the pre-seeded couple onboards, completing intake fires the Inngest_Workflow with visible parallel branches (analyze her/his, then the insurance and clinic calls), the dashboard shows the trying window with Low confidence and missing data, the Voice_Agent runs the live insurance and clinic calls with a visible LIVE/FALLBACK indicator and live transcript, the workflow pauses at the Booking_Approval_Gate until the couple approves, results become her/his/together tasks and a booked June 25 consult, a scheduled Check_In is set, and the Doctor_Summary is generated and reactively refreshed.
2. THE Fairy_System SHALL complete the demo path in under three minutes, including the Booking_Approval_Gate approval and a `CHECKIN_DELAY` set short enough to demonstrate the scheduled Check_In on stage.
3. IF a live agent call fails during the demo, THEN THE Fairy_System SHALL use the Mock_Fallback so the demo path completes, and the Booking_Approval_Gate SHALL still operate on the fallback result.

### Requirement 17: Human-in-the-Loop Booking Approval Gate (F17)

**User Story:** As a couple, we want to approve the appointment before it is actually booked, so that the agent acts on our behalf only with our consent.

#### Acceptance Criteria

1. WHEN both call steps have completed and before the clinic appointment is finalized, THE Inngest_Workflow SHALL pause at the Booking_Approval_Gate using `waitForEvent`, set the booking step status to paused, and keep the appointment status as pending.
2. WHILE the Booking_Approval_Gate is paused, THE Fairy_System SHALL display the Booking_Approval_Card stating that the agent verified coverage and found a June 25 slot and asking the couple to approve booking.
3. WHEN the couple approves on the Booking_Approval_Card, THE Fairy_System SHALL emit the `couple.booking.approved` event and THE Inngest_Workflow SHALL resume the same workflow run from the paused gate and finalize the booking, the June 25 calendar event, and the summary.
4. THE Inngest_Workflow SHALL finalize at most one booking for a given approval, and SHALL NOT double-book if the workflow run resumes.
5. IF the Booking_Approval_Gate times out after its configured wait window expires without a `couple.booking.approved` event, THEN THE Inngest_Workflow SHALL leave the appointment pending and surface a "needs approval" state rather than booking automatically.

### Requirement 18: Scheduled Male Check-In (F18)

**User Story:** As the male partner working on lifestyle factors, I want Fairy to follow up after my sperm-regeneration window, so that I am reminded to re-test and review progress.

#### Acceptance Criteria

1. WHEN the male lifestyle-improvement track is active, THE Inngest_Workflow SHALL schedule a delayed Check_In using `step.sleep`/`sleepUntil` over the ≈72-day (approximately 10 to 12 weeks) sperm-regeneration horizon defined in semen-analysis-reference.md.
2. THE Inngest_Workflow SHALL read the Check_In delay from the `CHECKIN_DELAY` environment variable so it can be set to seconds for the demo while the UI copy represents the ~72-day horizon.
3. WHEN the Check_In delay elapses, THE Inngest_Workflow SHALL wake (via a `checkin.due` event) and create a "re-test semen analysis / review lifestyle progress" task and a corresponding reminder.

### Requirement 19: Event-Driven Reactive Summary (F19)

**User Story:** As a demo audience, we want the doctor summary to update reactively as calls complete, so that the system reads as a reactive event graph rather than one monolithic function.

#### Acceptance Criteria

1. THE Fairy_System SHALL define and use the Workflow_Events `fertility.intake.completed`, `call.completed`, `couple.booking.approved`, and `checkin.due`.
2. THE Fairy_System SHALL implement the Reactive_Summary_Function as a separate Inngest function, decoupled from the main workflow, that listens for the `call.completed` event.
3. WHEN a `call.completed` event fires, THE Reactive_Summary_Function SHALL refresh the Doctor_Summary from the latest persisted call results.

### Requirement 20: Live Call Console and Parallel Workflow Visibility (F20)

**User Story:** As a demo audience, we want to watch the live conversation, the parallel branches, and the approval pause happen on screen, so that the agentic, concurrent, human-in-the-loop nature is visibly demonstrable.

#### Acceptance Criteria

1. WHILE a call is in progress, THE Call_Console SHALL append each agent and human turn to the live transcript in chronological order as the turn occurs.
2. THE Call_Console SHALL display a LIVE indicator while the result is sourced from the Live_Voice_Session and a FALLBACK indicator when the Mock_Fallback is used.
3. WHILE the Voice_Agent extracts the structured result, THE Call_Console SHALL progressively display each extracted result field as it is resolved.
4. WHEN the Inngest_Workflow runs fan-out branches concurrently, THE WorkflowViewer SHALL render those branches as parallel tracks (not a single line) and SHALL render each step's status as pending, running, completed, failed, or paused.
5. WHEN a step is paused at the Booking_Approval_Gate, THE WorkflowViewer SHALL render that step with the paused status.
