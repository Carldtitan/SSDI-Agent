# Impeccable critique — Fairy UI shell (Task 12.1)

**Location note:** This critique lives at `.kiro/specs/fairy/critique.md` (chosen over `components/fairy/critique.md` so it sits alongside the spec).

**Target:** The phone-frame shell — `PhoneFrame`, `StickyHeader`, `BottomTabs`, `DisclaimerFooter`, `Card`/`Field`, `EmptyState`, `AppShell`, and the `(tabs)` layout, plus the OKLCH token system in `globals.css` / `tailwind.config.ts`.

**Register:** Product (design serves the task; this is app UI, not a marketing surface).

**Date:** First critique pass for this target — no prior trend.

---

## Design intent

- **Mood:** Warm dawn light through a bedroom window — quiet intimacy meeting clinical clarity. Reassurance, never alarm.
- **Color strategy:** Restrained, leaning Committed. A single deep berry-rose primary (`oklch(0.47 0.155 350)`, from brand seed `seed-229`) carries identity on near-white surfaces; a calm indigo `--info`, teal `--success`, and amber `--warning` form a state vocabulary for the feature screens to come. No second decorative color.
- **Type:** One tuned sans (system stack — SF Pro on Apple), fixed rem scale per the product register, `-0.02em` display tracking with `text-wrap: balance` on headings.

---

## Design Health Score (Nielsen heuristics)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Active tab is clear (color + filled pill + `aria-current`); deeper status (loading/workflow) belongs to later tasks. |
| 2 | Match System / Real World | 4 | Plain language throughout ("Your shared fertility prep", "Trying window & priority days"); no jargon in chrome. |
| 3 | User Control and Freedom | 3 | Four flat destinations, always reachable. No back-trap. Undo/escape are feature-screen concerns. |
| 4 | Consistency and Standards | 4 | One button vocabulary, one card surface, one icon family (lucide), one radius scale, one token set. |
| 5 | Error Prevention | n/a | No input in the shell yet; intake validation is Task 13. |
| 6 | Recognition Rather Than Recall | 4 | Labeled tabs (never icon-only), titled per-screen header — location is always visible. |
| 7 | Flexibility and Efficiency | 2 | No keyboard accelerators beyond native tab/focus order. Acceptable for a 4-tab mobile shell; revisit if power use emerges. |
| 8 | Aesthetic and Minimalist Design | 4 | One disclaimer line, no badges, no clutter. Cards used only where they earn it; key/value data uses a quiet `Field` list, not boxes. |
| 9 | Error Recovery | n/a | Surfaced by feature screens (Task 14/16) and the workflow viewer. |
| 10 | Help and Documentation | 3 | Empty states teach what each screen will hold rather than showing a blank panel. |
| **Total** | | **30/35 scored** | **Good** — solid shell foundation; the unscored rows depend on feature tasks. |

---

## Anti-patterns verdict

**Does it look AI-generated? No.**

- **LLM assessment:** The shell avoids the common tells. No tracked uppercase eyebrows, no numbered section markers, no gradient text, no glassmorphism-by-default (the only blur is the functional sticky-header/tab backdrop), no side-stripe borders, no hero-metric template, no identical-card grid. The berry-rose-on-white palette is a committed choice from the seed, not the AI cream/sand default or AI-purple-on-white. Cards are deliberately rationed — `Field`/`FieldGroup` exist specifically so the data screens don't default to boxes.
- **Deterministic scan:** `detect.mjs` over `components/fairy`, `components/ui`, and `app/(tabs)` returned `[]` (clean, exit 0). No flagged slop families.
- **Visual overlays:** Browser visualization not run in this headless task context; CLI scan + manual review stand in. This is the one evidence gap (see P2 below).

---

## What's working

1. **The frame reads as a real device.** `PhoneFrame` fills the viewport edge-to-edge on a phone but floats as a rounded, softly-shadowed 390px column on desktop — the demo looks like an app, not a stretched page. The frame width is a single exported constant (`PHONE_WIDTH`) so it can't drift.
2. **Restraint with cards.** Offering `Field`/`FieldGroup` next to `Card` is a structural nudge against the "everything is a card" reflex. `Card` documents that nested cards are never correct.
3. **Calm, semantic color system.** OKLCH tokens with verified contrast (ink ~10:1, muted ~4.6:1 on white), white text on the saturated primary fill (Helmholtz-Kohlrausch correct), and a real state vocabulary (`success`/`warning`/`info`) ready for the feature screens — not invented per-component later.

---

## Priority issues

- **[P2] Browser-evidence gap.** Assessment B ran the CLI detector but not live browser overlays (no dev server / browser in this task context). _Fix:_ run `/impeccable critique` against `http://localhost:3000/home` once a dev server is up, on 3–5 representative screens, before the screen is called fully done. _Command:_ `/impeccable critique`.
- **[P2] Motion is minimal by design.** Only the content `fairy-rise` entrance and tab/button micro-transitions exist, each with a `prefers-reduced-motion` fallback. Adequate for a shell, but the workflow viewer (Task 10/14) is where motion should convey step state. _Fix:_ design step-status motion with the feature. _Command:_ `/impeccable animate`.
- **[P3] Flexibility ceiling.** No keyboard accelerators. Fine for a 4-tab mobile app; only revisit if the product grows a desktop power-user surface.

---

## Persona red flags

- **Jordan (First-Timer):** Low risk. Tabs are labeled, copy is plain, the active location is always shown, and empty states explain what is coming rather than dead-ending. No icon-only nav, no jargon.
- **Sam (Anxious / high-stakes domain — fertility):** Low risk by construction. Exactly one quiet disclaimer line, zero synthetic-data badges or warnings (Req 14), reassuring-not-alarming color (warm rose, not clinical red). The amber/red `--warning`/`--destructive` tokens must stay reserved for genuine borderline/error states on the data screens so the calm baseline holds.

---

## Questions to consider

- When the workflow viewer lands, should step transitions animate to make orchestration feel alive, or stay still to keep the anxious persona calm? (Lean: subtle, state-conveying motion only.)
- Should the desktop float gain a subtle device status-bar detail, or does that tip from "considered" into skeuomorphic decoration? (Lean: leave it clean.)

---

## Outcome

Shell passes the critique bar for a **Good (30/35 scored)** foundation: no AI-slop tells, clean deterministic scan, committed palette and type system, disclaimer/clutter rules satisfied (Property 26 green), and the 390px frame + four tabs verified by the structural test. The one open item is live browser-overlay evidence (P2), to be run against a dev server before the dependent feature screens (Tasks 14–18) are considered done.

First run for this target — no trend yet.
