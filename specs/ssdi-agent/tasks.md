# Implementation Plan: SSDI Agent Computer Use MVOP

## Overview

This plan implements the SSDI Agent requirements and design in dependency order. No task is complete until its verification passes. The two-hour path prioritizes one real fresh-input loop over packaging breadth.

## Tasks

- [x] 1. Establish the SSDI Agent specification and identity — 15 minutes
  - [x] 1.1 Create the interconnected requirements, design, and tasks documents.
    - _Requirements: C1.3_
    - **Verification:** all three files exist under `specs/ssdi-agent/`, and design/tasks reference requirement IDs.
  - [x] 1.2 Rename product, package, translations, packet metadata, downloads, documentation, and tests to SSDI Agent.
    - _Requirements: C1.1-C1.2_
    - **Verification:** retired-brand scans across tracked text and filenames return no matches.
  - [x] 1.3 Keep the labeled Elena sample application shortcut separate from live computer use, and remove query-parameter and prerecorded result shortcuts.
    - _Requirements: C10.1_
    - **Verification:** Elena can prefill only the application case; production code has no demo query parameter, prerecorded packet fallback, or synthetic computer-use result path.

- [x] 2. Build the secure SSDI Agent Desktop shell — 20 minutes
  - [x] 2.1 Add Electron main/preload entrypoints and desktop scripts.
    - _Requirements: C2.1, C8.1-C8.5_
    - **Verification:** `npm run desktop:dev` loads the local SSDI Agent page with `window.ssdi-agentDesktop` available.
  - [x] 2.2 Add bounded UI Automation observation and session-only file authorization from a real Explorer selection.
    - _Requirements: C2.2-C2.4_
    - **Verification:** the read-only native check captures active-window accessibility descriptions; unregistered paths are rejected.
  - [x] 2.3 Emit native activity events and validate sender origin for every IPC handler.
    - _Requirements: C6.1, C8.3-C8.4_
    - **Verification:** invalid-origin and malformed calls fail without filesystem access.

- [x] 3. Implement visible Windows tools — 40 minutes
  - [x] 3.1 Add bounded UI Automation invoke, focus, keyboard, mouse, scroll, app-launch, and wait actions.
    - _Requirements: C3.2-C3.3, C4.1-C4.2, C8.5, C12.1-C12.5_
    - **Verification:** the desktop executor can observe the current screen and drive a real accessible control without arbitrary shell access.
  - [x] 3.2 Register real Explorer selections and add local text/PDF extraction and image OCR.
    - _Requirements: C4.3-C4.5, C5.1-C5.3, C12.6_
    - **Verification:** only a visibly selected file becomes a candidate, and no full file reaches the server.
  - [x] 3.3 Add opaque Candidate_File results, bounded preview, and safe open behavior.
    - _Requirements: C4.5-C4.6, C7.1-C7.2_
    - **Verification:** candidate operations work by ID; unknown IDs and renderer-supplied paths fail.

- [x] 4. Implement the hosted Computer_Agent loop — 30 minutes
  - [x] 4.1 Add shared schemas and `POST /api/computer/turn` using Claude structured output.
    - _Requirements: C3.1-C3.5, C9.2-C9.3_
    - **Verification:** valid requests return one valid state; malformed requests return 400 with no-store headers.
  - [x] 4.2 Add environment-first orchestration, real tool-result feedback, and action/time limits.
    - _Requirements: C3.4-C3.5, C9.1, C9.4-C9.5_
    - **Verification:** the loop cannot finish with a candidate that was absent from native results and terminates at its bounds.

- [x] 5. Integrate computer use into the SSDI Agent workspace — 25 minutes
  - [x] 5.1 Add a persistent connected/disconnected control with voice and typed requests.
    - _Requirements: C2.1, C2.5, C3.1, C11.1-C11.2_
    - **Verification:** the control remains reachable across Application, Documents, and Records and works without a mouse.
  - [x] 5.2 Add chronological activity, serialized Guava/Guava narration, and visible fallback.
    - _Requirements: C6.1-C6.6_
    - **Verification:** actual Windows actions appear in the visible and spoken sequence; forced TTS failure does not stop execution.
  - [x] 5.3 Add candidate result, preview/open, and in-memory case-association UI.
    - _Requirements: C7.1-C7.4_
    - **Verification:** a candidate can be inspected and linked without changing confirmed Applicant_Case facts.

- [ ] 6. Verify the real fresh-input path — 10 minutes
  - [x] 6.1 Run focused unit, component, typecheck, build, and regression tests.
    - _Requirements: C8, C9, C11_
    - **Verification:** tests, `npm run typecheck`, and `npm run build` pass.
  - [ ] 6.2 Run one voice-driven fresh-input search in SSDI Agent Desktop.
    - _Requirements: C10.2-C10.4_
    - **Verification:** add or rename an unseen file after launch, ask for it naturally, and observe real planning, native activity, matching result, and TTS without a code change.
  - [x] 6.3 Deploy the SSDI Agent-branded web application and load it through SSDI Agent Desktop.
    - _Requirements: C1, C2.1, C10.4_
    - **Verification:** the configured deployed origin completes the same fresh-input path.

- [x] 7. Replace search-only behavior with visible Windows computer use
  - [x] 7.1 Add active-window UI Automation observation and bounded app/input actions.
    - _Requirements: C12.1-C12.3, C12.5_
  - [x] 7.2 Add an accessibility-description planning loop, post-action verification, progress state, and Stop control.
    - _Requirements: C12.1-C12.4_
  - [x] 7.3 Register real File Explorer selections as opaque case candidates.
    - _Requirements: C12.6_

- [x] 8. Create the complete local case-folder path
  - [x] 8.1 Generate the five core documents as separate PDF assets.
    - _Requirements: C13.1-C13.2_
  - [x] 8.2 Persist explicit case links in the desktop session and copy those files during export.
    - _Requirements: C7.3, C13.3_
  - [x] 8.3 Add unique-folder creation, missing-document and README files, and final Explorer opening.
    - _Requirements: C13.4-C13.5_

- [x] 9. Migrate the web voice and model stack
  - [x] 9.1 Replace Deepgram browser routes with the Guava Web SDK and Guava speech.
    - _Requirements: C3, C6, C10, C11_
  - [x] 9.2 Feed final Guava transcripts into the existing confirmation and Applicant_Case flow.
    - _Requirements: C3, C8, C11_
  - [x] 9.3 Replace Anthropic extraction and computer planning with Claude structured JSON plus Zod validation.
    - _Requirements: C3, C9, C11_
  - [x] 9.4 Remove legacy provider packages, routes, and environment variables.
    - _Requirements: C9, C11_

## Dependency Graph

```text
1 Specification and identity
  -> 2 Desktop shell
  -> 3 Local tools
  -> 4 Agent loop
  -> 5 Workspace integration
  -> 6 Fresh-input verification
  -> 9 Voice and model migration
```

## Notes

- `npm run desktop` is the MVOP Windows delivery; installer packaging follows only after the live path passes.
- Browser automation remains later work. General Windows UI Automation, visible app control, and case-folder export are now part of this build.
