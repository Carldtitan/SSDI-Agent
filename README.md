# SSDI Agent

SSDI Agent helps a person prepare a Social Security Disability Insurance
application through a guided voice conversation, turns their confirmed answers
into a real filing packet, and then calls their doctors' offices to chase the
medical records the claim depends on.

Voice runs entirely on [Guava](https://goguava.ai) — Guava does the speech
recognition, the turn-taking, and the speech synthesis, on the phone and in the
browser alike.

## The problem

An SSDI application is not one form. The applicant has to reconstruct every
doctor, clinic, hospital, treatment date, diagnosis, medication, and test; five
years of work history in job-duty detail; earnings; education; and the specific
ways each condition limits work. All of it has to stay consistent across four
long federal documents.

Then the hard part starts. SSA decides claims on medical evidence, and missing
records are the most common reason an initial claim is denied. Getting them means
phoning every provider who ever treated you and asking each one how it wants to
be asked — portal, fax, mail, its own release form or a signed SSA-827, what it
charges, how long it takes.

That is a lot of administrative work to hand someone who is managing pain,
fatigue, cognitive limits, or paralysis. SSDI Agent does the paperwork and makes
the calls.

## What it does

**Guided application.** A continuous voice or typed interview instead of
government forms. Questions are asked in plain language, answers are read back
before they are saved, and a fact only counts once the applicant has confirmed
it. Contradictions are kept as conflicts and block document generation until
resolved. English, Spanish, and Mandarin.

**Generated packet.** Confirmed facts flow through typed adapters into SSA-16,
SSA-3368, SSA-3369, and a blank-signature SSA-827 via Anvil, with continuation
sheets for extra providers, medications, and jobs, plus a medical evidence index.

**Records tracker.** A deterministic follow-up clock built on the HIPAA Right of
Access 30-day window, with a 20-day nudge, a 30-day escalation, extension
handling, and a spoken follow-up script.

**Outbound records calls.** The agent phones a provider's medical records office
and returns its request procedure as twelve typed fields. This is the piece that
turns the tracker from a to-do list into something that actually moves.

## The outbound records call

The call is not a recording to listen to later. It fills a checklist, and every
value comes back typed and validated:

| Field | Type |
|---|---|
| `reached_records_office` | yes / no / transferred |
| `request_method` | portal / fax / secure email / mail / in person / phone |
| `accepts_ssa827` | yes / no / unsure |
| `fax_number` | text, read back digit by digit |
| `portal_url` | text |
| `mailing_address` | text |
| `turnaround_days` | integer |
| `copy_fee` | text |
| `fee_waived_for_disability` | yes / no / unsure |
| `records_contact` | text |
| `patient_must_call` | yes / no |
| `additional_instructions` | text |

A real captured run:

```json
{
  "request_method": "patient_portal",
  "accepts_ssa827": "yes",
  "turnaround_days": 10,
  "copy_fee": "$25",
  "fee_waived_for_disability": "yes",
  "patient_must_call": "no",
  "additional_instructions": "Please include the date range of treatment being requested."
}
```

`turnaround_days` is the integer `10`, not the phrase "about ten business days".
That is the whole point: a free-form phone conversation collapsed into a row the
tracker can act on.

### Compliance posture

The agent never needs protected health information to do its job, because it only
ever asks about general procedure. Enforced in structure, not hoped for in a
prompt:

- Identifies itself as automated in its first sentence, and answers honestly if
  asked whether it is a recording.
- Never claims to be the patient, a family member, an attorney, or SSA.
- Never states or confirms an SSN, date of birth, address, account number,
  diagnosis, or medication — even when asked directly.
- If the office requires patient verification, it does not attempt it. It records
  `patient_must_call` and closes.
- On voicemail it leaves a message with no patient detail.
- `on_question` answers only from `agent/knowledge.md`, so it cannot invent policy
  about SSA-827 validity or fee waivers.
- The web route requires `consent` to be the literal `true`, rate-limits to three
  calls an hour, normalizes to E.164, fails closed when unconfigured, and never
  logs a request body.

## Architecture

```
  Next.js app (Vercel)
    guided interview ─────► Anthropic ──► schema-constrained facts (Zod validated)
    browser voice ────────► Guava WebRTC (STT + TTS)
    packet ───────────────► Anvil ──► SSA-16 / 3368 / 3369 / 827
    records tracker ──┐
                      │  POST /api/records/call
                      ▼
              Python shim (agent/serve.py)
                      │  agent.call_phone()
                      ▼
              Guava ──► the provider's records office
                      │
                      └──► on_task_complete ──► POST /api/webhook (12 fields)
```

The shim exists for a specific reason: **Guava has no REST endpoint that places a
single outbound call.** The SDK dials over a persistent websocket held open by the
agent process, so a serverless route cannot dial directly. There is likewise no
REST endpoint returning extracted fields — only transcript and recording — so the
agent publishes its own result from `on_task_complete`. Both are the supported
path, not workarounds.

## Layout

| Path | What it is |
|---|---|
| `app/` | Next.js routes and API handlers |
| `components/` | UI, including the guided application and records tracker |
| `lib/` | Case model, conversation rules, form adapters, deadline math |
| `config/ssa-2026.json` | Dated SSA thresholds, swappable each year |
| `anvil_fields/` | Field maps for the four SSA templates |
| `agent/main.py` | The Guava voice agent: persona, compliance rules, checklist |
| `agent/knowledge.md` | Vetted knowledge base for `on_question` |
| `agent/serve.py` | HTTP shim so the web app can trigger a real call |
| `agent/rehearse.py` | Phone-free end-to-end run via Guava roleplay |

## Running it

```bash
npm install
npm run dev
```

The voice agent runs separately:

```bash
guava login
guava run ./agent
```

`SSDI_MODE` selects the channel — `chat` (terminal, no audio), `local`
(laptop mic), `webrtc` (browser link), `inbound` (answer on
`SSDI_AGENT_NUMBER`), `outbound` (call `SSDI_TARGET_NUMBER`), or `campaign`
(Guava's dialer works a contact list). Every mode passes the same variables, so a
terminal rehearsal exercises exactly the path a phone call takes.

To prove the extraction without a phone:

```bash
cd agent && uv run rehearse.py
```

Guava roleplays a records clerk against the real agent and prints the captured
fields.

## Known gaps

- Results are held in memory, not a database; a restart loses them, and on
  serverless the webhook and the UI poll can land on different instances.
- The shim runs one call at a time by design.
- Guava's server-side RAG backs `knowledge.md`; production should move to a
  dedicated vector store, which Guava supports.
- A new Guava number has no carrier reputation, so outbound calls can be screened
  to voicemail before they ring.
- SSA submission, browser automation, and file uploads are out of scope.

SSDI Agent does not act as the applicant's representative and does not promise
approval.
