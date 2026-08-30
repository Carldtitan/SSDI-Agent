# Requirements Document: SSDI Agent Computer Use MVOP

## Introduction

SSDI Agent extends the existing voice-guided SSDI application product with visible, read-only Windows computer use. The hosted Vercel application remains the primary interface. SSDI Agent Desktop observes the real screen and Windows accessibility tree, operates desktop applications, verifies selected evidence, and creates the final local case folder.

The computer-use feature must satisfy the current hack rule: a fresh, messy file request must produce an actual result without forced outputs, prerecorded actions, or document-specific branching. An explicitly labeled Elena Rivera sample case may prefill the existing SSDI application for a fast stage walkthrough, but it must never supply or alter computer-use requests, actions, candidates, or results. The agent may understand SSDI context, but its computer tools must accept arbitrary natural-language file requests such as “find my driver's license” or “find the lease Jordan signed.”

## Non-negotiable Rules

1. Every claimed computer action and result must come from an actual native tool event.
2. No document type, filename, path, result, or success state may be predetermined for the judged flow.
3. Local files enter the case only after SSDI Agent visibly finds and selects them in File Explorer.
4. V1 computer use is read-only. It may open apps, navigate, search, inspect, preview, select, and open; it may not delete, move existing files, upload, sign, send, purchase, or submit.
5. Spoken activity must always have an equivalent visible status.
6. Existing SSDI completion, validation, Anvil generation, and accessibility behavior must continue working.

## Glossary

- **SSDI Agent**: The complete voice-guided SSDI preparation product.
- **SSDI Agent_Desktop**: The Electron Windows shell that loads the deployed SSDI Agent web application and exposes a constrained preload bridge.
- **Computer_Agent**: The hosted planning loop that converts arbitrary user requests and real tool results into the next typed action.
- **Computer_Environment**: A sanitized description of Windows and the bounded capabilities available to the planner.
- **Computer_Tool**: A typed, read-only native capability available to the Computer_Agent.
- **Candidate_File**: A real file selected in File Explorer and represented to the web application by an opaque session identifier.
- **Activity_Event**: A truthful started, progress, completed, or failed event emitted by native execution.
- **Fresh_Input_Run**: A run against content not encoded into SSDI Agent and not selected because of a known output.

## Requirements

### Requirement C1: SSDI Agent Identity

**User Story:** As an applicant, I want one consistent product identity so that I know which assistant is helping me.

#### Acceptance Criteria

1. THE product SHALL identify itself as SSDI Agent in visible copy, spoken introductions, metadata, generated packet metadata, documentation, tests, and download names.
2. THE tracked repository SHALL contain no product or package reference to the former name.
3. THE authoritative specification SHALL be `specs/ssdi-agent/requirements.md`, `design.md`, and `tasks.md`.

### Requirement C2: Desktop Connection and Consent

**User Story:** As an applicant, I want visible, temporary computer access so that SSDI Agent cannot silently scan my computer.

#### Acceptance Criteria

1. WHEN the Vercel app runs inside SSDI Agent_Desktop, THE interface SHALL show that local computer access is connected.
2. BEFORE a task starts, THE interface SHALL disclose that active-window accessibility descriptions are sent to the hosted planner.
3. THE native executor SHALL expose a local file only after the user can see it selected in File Explorer.
4. THE file authorization and candidate IDs SHALL expire when SSDI Agent_Desktop exits.
5. WHEN the app runs in a normal browser, THE interface SHALL explain that SSDI Agent_Desktop is required for Windows control without pretending that control occurred.

### Requirement C3: Arbitrary Natural-Language Requests

**User Story:** As an applicant, I want to ask for any local document in ordinary language so that I do not need to know filenames or folder structures.

#### Acceptance Criteria

1. THE Computer_Agent SHALL accept free-form voice or typed requests.
2. THE planning contract SHALL NOT use a closed enumeration of SSDI document types.
3. THE same production path SHALL handle SSDI-related and unrelated document requests.
4. THE Computer_Agent SHALL receive Computer_Environment context before choosing its first action.
5. THE Computer_Agent SHALL base every later action on the actual preceding Computer_Tool result.

### Requirement C4: Visible Local File Discovery

**User Story:** As an applicant, I want SSDI Agent to inspect real filenames and contents so that it can find poorly named documents.

#### Acceptance Criteria

1. THE agent SHALL use visible File Explorer navigation and search controls rather than a hidden keyword index.
2. THE agent SHALL reason over the current active-window accessibility descriptions after each action.
3. AFTER a real Explorer selection is registered, THE executor SHALL support local extraction from text files, text PDFs, and common image formats.
4. WHEN a selected image needs inspection, THE executor SHALL be able to run local English OCR and use the extracted text as evidence.
5. THE executor SHALL return Candidate_File records with actual names, display paths, timestamps, verification evidence, and opaque IDs.
6. WHEN nothing is sufficiently relevant, THE result SHALL say no confident match was found and SHALL NOT manufacture one.

### Requirement C5: Local-First Analysis and Data Minimization

**User Story:** As an applicant, I want sensitive files to stay on my computer as much as possible.

#### Acceptance Criteria

1. THE desktop executor SHALL perform file parsing, OCR, and preview generation locally after visible selection.
2. THE web agent MAY receive metadata, bounded text excerpts, and the active-window accessibility tree while a visible task is running.
3. THE web agent SHALL NOT receive complete local files; the interface SHALL disclose that accessibility descriptions are sent to the hosted planner during computer use.
4. THE server SHALL reject excerpts above the configured length and SHALL use `Cache-Control: no-store`.
5. THE application SHALL NOT persist Candidate_File data, excerpts, or computer-agent history after the session.

### Requirement C6: Truthful Visible and Spoken Activity

**User Story:** As an applicant who cannot comfortably monitor the screen, I want SSDI Agent to tell me exactly what it is doing.

#### Acceptance Criteria

1. EACH native action SHALL emit Activity_Event values for start and final outcome, plus bounded progress updates when useful.
2. THE interface SHALL show events in chronological order using plain language.
3. THE interface SHALL speak important events through the existing TTS path.
4. Spoken folder names, file counts, candidate counts, and success statements SHALL be derived from Activity_Event or Computer_Tool result values.
5. THE speech queue SHALL prevent overlapping narration.
6. IF TTS fails, THEN visible status and computer execution SHALL continue.

### Requirement C7: Results and SSDI Case Integration

**User Story:** As an applicant, I want to inspect what SSDI Agent found and relate it to my application.

#### Acceptance Criteria

1. WHEN a file request completes, THE interface SHALL show verified Candidate_File results and the evidence supporting each match.
2. THE user SHALL be able to preview a supported candidate or open it in the normal Windows application.
3. THE user SHALL be able to associate a candidate with a current case document need in memory without uploading or moving the file.
4. A later correction or search SHALL NOT erase confirmed application answers or generated-form state.

### Requirement C8: Secure Desktop Boundary

**User Story:** As an applicant, I want the desktop bridge to expose only the capabilities SSDI Agent needs.

#### Acceptance Criteria

1. SSDI Agent_Desktop SHALL load only the configured HTTPS SSDI Agent origin, except an explicit localhost development URL.
2. THE Electron renderer SHALL run with Node integration disabled, context isolation enabled, sandboxing enabled, and web security enabled.
3. EVERY IPC request SHALL validate its sender origin and input contract.
4. THE preload bridge SHALL expose named SSDI Agent methods and SHALL NOT expose `ipcRenderer`, Node APIs, PowerShell, or arbitrary shell execution.
5. Native candidate tools SHALL accept opaque candidate identifiers rather than renderer-supplied absolute paths.

### Requirement C9: Bounded Agent Execution and Recovery

**User Story:** As an applicant, I want SSDI Agent to stop safely and explain problems instead of looping or claiming success.

#### Acceptance Criteria

1. THE Computer_Agent SHALL execute at most twenty actions and three minutes for one request.
2. THE planner SHALL return exactly one of `act`, `finish`, `clarify`, or `error` per turn.
3. THE client SHALL reject malformed actions before invoking the desktop bridge.
4. IF Claude, OCR, parsing, folder access, or native execution fails, THEN SSDI Agent SHALL preserve application state and explain the failed step and next option.
5. THE agent SHALL never convert an error into a successful Candidate_File result.

### Requirement C10: Fresh-Input Acceptance

**User Story:** As a judge, I want to choose an unseen input so that I can verify the agent is real.

#### Acceptance Criteria

1. THE production interface MAY expose the labeled Elena Rivera sample application loader, but SHALL contain no demo query parameter, prerecorded fallback, synthetic computer-use result, or forced computer-use result path.
2. A file added or renamed after SSDI Agent starts SHALL be discoverable on the next request without rebuilding or changing configuration.
3. Two unrelated natural-language requests SHALL produce plans and results grounded in their respective real inputs.
4. THE live path SHALL run from voice request through STT, planning, native execution, result display, and TTS narration.

### Requirement C11: Existing SSDI and Voice Regression Safety

**User Story:** As an applicant, I want computer use added without losing the application workflow that already works.

#### Acceptance Criteria

1. SSDI Agent SHALL preserve the Application, Documents, and Records stages.
2. SSDI Agent SHALL provide Guava-orchestrated voice with Guava transcription and speech for every supported language, while preserving typed input.
3. SSDI Agent SHALL preserve canonical case confirmation, completeness checks, form adapters, Anvil packet generation, and no-store responses.
4. SSDI Agent SHALL remain keyboard operable, screen-reader understandable, responsive at 320 CSS pixels, and usable at 200 percent zoom.

### Requirement C12: Visible Windows Computer Use

**User Story:** As an applicant, I want SSDI Agent to operate the same desktop applications I can see so that it can complete multi-step computer work instead of only querying a folder index.

#### Acceptance Criteria

1. THE desktop executor SHALL read the active-window UI Automation controls after every GUI-changing action.
2. THE Computer_Agent SHALL be able to open supported apps, focus windows, invoke accessible controls, click visible coordinates, type, press bounded key chords, scroll, and wait.
3. THE executor SHALL prefer UI Automation invocation and SHALL use control bounds only when an accessible element cannot be invoked directly.
4. THE interface SHALL expose the latest Windows view, current action, and an immediate Stop control.
5. THE executor SHALL block terminals, credential surfaces, destructive controls, submission, purchase, upload, and system-security changes.
6. A local document SHALL become a Candidate_File only after a real selected File Explorer item is registered.

### Requirement C13: Complete Local Case Folder

**User Story:** As an applicant, I want one organized folder containing my generated application and evidence so that I know what is ready and what remains missing.

#### Acceptance Criteria

1. AFTER document generation, SSDI Agent_Desktop SHALL allow the user to choose where a new case folder is created.
2. THE folder SHALL contain separate PDFs for SSA-16, SSA-3368, SSA-3369, SSA-827, and the evidence index.
3. THE folder SHALL copy every Candidate_File explicitly linked to the case without moving or changing its source file.
4. THE folder SHALL contain a plain-text list of supporting documents still marked missing.
5. THE exporter SHALL use a new unique directory, reject unsafe archive entries, avoid overwriting existing files, and open the finished folder in File Explorer.
