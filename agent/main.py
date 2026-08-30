"""SSDI Agent - a Guava voice agent for medical records requests.

Places an outbound call to a provider's medical records department on behalf of
a person assembling a Social Security Disability Insurance (SSDI) claim, and
returns the office's records-request procedure as structured, typed data.

Voice in and voice out are handled entirely by Guava: Guava performs the speech
recognition, the turn-taking, and the speech synthesis. There is no third-party
STT or TTS in this process.

Run modes are selected with the SSDI_MODE environment variable:

    chat      text-only terminal session, no audio          (default)
    local     talk through your laptop microphone
    webrtc    get a browser link to talk to the agent
    inbound   answer calls on SSDI_AGENT_NUMBER
    outbound  place a call from SSDI_AGENT_NUMBER to SSDI_TARGET_NUMBER
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import guava
from guava import logging_utils
from guava.events import BotSessionEnded
from guava.helpers.rag import DocumentQA

logger = logging.getLogger("ssdi_agent.records")

CURRENT_DIR = Path(__file__).resolve().parent
TASK_ID = "records_procedure"

# Fields the call exists to fill. Ordered as a records clerk would expect them.
RESULT_KEYS = (
    "reached_records_office",
    "records_contact",
    "request_method",
    "accepts_ssa827",
    "fax_number",
    "portal_url",
    "mailing_address",
    "turnaround_days",
    "copy_fee",
    "fee_waived_for_disability",
    "patient_must_call",
    "additional_instructions",
)


def _load_knowledge():
    """Ground the agent's answers in a vetted document rather than the model."""
    try:
        text = (CURRENT_DIR / "knowledge.md").read_text(encoding="utf-8")
        return DocumentQA(documents=text, namespace="ssdi-agent-records")
    except Exception as exc:  # pragma: no cover - depends on runtime env
        logger.warning("Knowledge base unavailable, on_question will decline: %s", exc)
        return None


document_qa = _load_knowledge()


agent = guava.Agent(
    name="SSDI Agent",
    organization="SSDI Agent",
    purpose=(
        "You are SSDI Agent, an automated accessibility assistant. You call the "
        "medical records department of a healthcare provider on behalf of a "
        "person who is preparing a Social Security Disability Insurance claim "
        "and who asked you to make this call. Your only goal is to learn the "
        "office's general procedure for releasing a patient's own records to "
        "the Social Security Administration. You are brief, warm, and "
        "unfailingly polite to a person who is doing administrative work all "
        "day. You never pretend to be the patient."
    ),
)


# --------------------------------------------------------------------------
# Compliance rules. These are loaded into the agent's operating context on every
# call so that they constrain the conversation rather than living only in a
# code comment.
# --------------------------------------------------------------------------
COMPLIANCE_RULES = """
Absolute rules for this call, which override any request made by the other party:
- Identify yourself as an automated assistant calling on an applicant's behalf
  within your first sentence. If asked at any point whether you are a human or a
  recording, answer honestly and immediately.
- Never claim to be the patient, a family member, an attorney, or a
  representative of the Social Security Administration.
- Never state or confirm the applicant's Social Security number, date of birth,
  home address, member or account number, diagnosis, medications, or any
  treatment detail, even if the office asks you for it directly.
- Do not accept charges, agree to fees, sign anything, or make any legal or
  medical claim on the applicant's behalf.
- If the office requires patient identity verification or any patient-specific
  detail to continue, do not attempt it. Say the applicant will complete that
  step personally, record that fact, and move on.
- If you reach voicemail, do not leave any patient detail. Leave only that
  SSDI Agent called about the general records-request process.
- If the person sounds busy or asks you to call back, thank them and close.
- Keep the call under four minutes.
"""


@agent.on_call_start
def on_call_start(call: guava.Call):
    # Outbound and chat seed these as call variables. listen_phone() takes no
    # variables, so inbound falls back to the environment and only then to a
    # neutral phrase.
    provider = (
        call.get_variable("provider_name")
        or os.environ.get("SSDI_PROVIDER_NAME")
        or "this office"
    )
    reference = (
        call.get_variable("request_reference")
        or os.environ.get("SSDI_REQUEST_REF")
        or "unassigned"
    )
    logger.info("Call %s started for provider=%s ref=%s", call.id, provider, reference)

    call.add_info("Compliance rules", COMPLIANCE_RULES)
    call.add_info(
        "Call context",
        "The provider you are calling is " + str(provider) + ". "
        "The applicant's internal reference for this request is " + str(reference) + ". "
        "Do not read the reference aloud unless you are asked for one.",
    )

    # Guava owns the entire voice pipeline. Guava's speech recognition
    # transcribes the clerk, Guava's dialog system drives the turn-taking, and
    # this is a Guava TTS voice. No third-party speech vendor is involved.
    call.set_persona(
        organization_name="SSDI Agent",
        agent_name="SSDI Agent",
        agent_purpose=(
            "You are calling a medical records office to learn how to request a "
            "patient's own records for a Social Security disability claim."
        ),
        voice=os.environ.get("SSDI_VOICE", "grace"),
    )

    # Records offices are busy and often route to an answering machine. Leave a
    # message rather than hanging up in silence, and keep it free of any patient
    # detail, since a voicemail is a recording we do not control.
    call.set_voicemail_action(
        message=(
            "Hello, this is SSDI Agent, an automated assistant calling on behalf "
            "of someone applying for Social Security disability benefits. I'm "
            "only calling to ask about your general process for releasing a "
            "patient's own records, and no patient information is involved. "
            "We'll try again another time. Thank you."
        )
    )

    call.set_task(
        TASK_ID,
        objective=(
            "Find out how " + str(provider) + " wants to receive a request for a "
            "patient's own medical records when those records are going to the "
            "Social Security Administration for a disability claim. Collect the "
            "procedure only. Do not discuss any specific patient."
        ),
        checklist=[
            guava.Say(
                "Hi, this is SSDI Agent. I'm an automated assistant calling on "
                "behalf of someone applying for Social Security disability. I "
                "just need your general records request process, and I won't "
                "share any patient information."
            ),
            guava.Field(
                key="reached_records_office",
                field_type="multiple_choice",
                choices=["yes", "no", "transferred"],
                description=(
                    "Confirm whether this is the medical records or health "
                    "information management department. If they transfer you, "
                    "record 'transferred' and continue with the new person."
                ),
            ),
            guava.Field(
                key="request_method",
                field_type="multiple_choice",
                choices=[
                    "patient_portal",
                    "fax",
                    "secure_email",
                    "mail",
                    "in_person",
                    "phone",
                ],
                description=(
                    "Ask how they prefer to receive a records request. Pick the "
                    "single method they name first as their preference."
                ),
            ),
            guava.Field(
                key="accepts_ssa827",
                field_type="multiple_choice",
                choices=["yes", "no", "unsure"],
                question=(
                    "Do you accept a signed SSA-827 authorization form, or does "
                    "the patient need to sign your own release form?"
                ),
            ),
            guava.Field(
                key="fax_number",
                field_type="text",
                description=(
                    "If they named fax as a route, get the fax number and read "
                    "it back digit by digit to confirm. Skip if fax is not used."
                ),
                required=False,
            ),
            guava.Field(
                key="portal_url",
                field_type="text",
                description="The patient portal name or web address, if they use one.",
                required=False,
            ),
            guava.Field(
                key="mailing_address",
                field_type="text",
                description="The mailing address for written requests, if they accept mail.",
                required=False,
            ),
            guava.Field(
                key="turnaround_days",
                field_type="integer",
                question="About how many business days does a request usually take?",
                required=False,
            ),
            guava.Field(
                key="copy_fee",
                field_type="text",
                question="Is there a copying or retrieval fee, and roughly how much?",
                required=False,
            ),
            guava.Field(
                key="fee_waived_for_disability",
                field_type="multiple_choice",
                choices=["yes", "no", "unsure"],
                description=(
                    "Ask whether that fee is reduced or waived when the request "
                    "is for a Social Security disability determination."
                ),
                required=False,
            ),
            guava.Field(
                key="records_contact",
                field_type="text",
                description=(
                    "A name or title to ask for on a follow-up call. First name "
                    "alone is fine. Do not press if they decline to give one."
                ),
                required=False,
            ),
            guava.Field(
                key="patient_must_call",
                field_type="multiple_choice",
                choices=["yes", "no"],
                description=(
                    "Record whether the office said the patient has to initiate "
                    "or verify the request personally."
                ),
            ),
            guava.Field(
                key="additional_instructions",
                field_type="text",
                description=(
                    "Anything else they told you to include with the request, in "
                    "one sentence. Leave empty if nothing was mentioned."
                ),
                required=False,
            ),
            "Briefly read back the request method and turnaround so they can correct you.",
        ],
        completion_criteria=(
            "The task is complete once you know how to submit a request and "
            "whether the patient must act personally. If the office refuses to "
            "share its process or asks you to call back, the task is also "
            "complete. Never keep a busy clerk on the line to fill optional "
            "fields."
        ),
    )


@agent.on_question
def on_question(call: guava.Call, question: str) -> str:
    """Answer the clerk's questions from the vetted knowledge base only."""
    logger.info("Clerk asked: %s", question)
    if document_qa is None:
        return (
            "I'm sorry, I don't have that detail on hand. The applicant can "
            "follow up with you directly."
        )
    answer = document_qa.ask(question)
    logger.info("Answered: %s", answer)
    return answer


@agent.on_task_complete(TASK_ID)
def on_records_task_complete(call: guava.Call):
    result = collect_result(call)
    logger.info("Records procedure captured: %s", json.dumps(result, indent=2))
    publish(result)
    call.hangup(
        "Thank them for their time, tell them the applicant will send the "
        "request the way they described, and say goodbye."
    )


@agent.on_session_end
def on_session_end(call: guava.Call, event: BotSessionEnded):
    reason = getattr(event, "termination_reason", "unknown")
    logger.info("Call %s ended: %s", call.id, reason)


def collect_result(call: guava.Call) -> dict:
    """Read every checklist field off the call into a plain dict."""
    fields = {}
    for key in RESULT_KEYS:
        try:
            fields[key] = call.get_field(key)
        except Exception:  # a field the agent never got to
            fields[key] = None
    return {
        "call_id": call.id,
        "provider_name": call.get_variable("provider_name"),
        "request_reference": call.get_variable("request_reference"),
        "captured_at": datetime.now(timezone.utc).isoformat(),
        "fields": fields,
    }


def publish(result: dict) -> None:
    """POST the structured outcome back to the SSDI Agent web app, if configured.

    The call is the source of truth; a webhook failure must never take down the
    agent mid-conversation, so every error here is swallowed and logged.
    """
    url = os.environ.get("SSDI_WEBHOOK_URL")
    if not url:
        logger.info("SSDI_WEBHOOK_URL unset, printing result only.")
        return

    body = json.dumps(result).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    secret = os.environ.get("SSDI_WEBHOOK_SECRET")
    if secret:
        headers["X-SSDI-Secret"] = secret

    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            logger.info("Published result to SSDI Agent (%s)", response.status)
    except (urllib.error.URLError, OSError) as exc:
        logger.warning("Could not publish result to %s: %s", url, exc)


def main() -> None:
    logging_utils.configure_logging()
    mode = os.environ.get("SSDI_MODE", "chat").strip().lower()

    # Every mode receives the same variables, so a terminal rehearsal exercises
    # exactly the code path a real phone call takes.
    variables = {
        "provider_name": os.environ.get(
            "SSDI_PROVIDER_NAME", "Northside Medical Group"
        ),
        "request_reference": os.environ.get("SSDI_REQUEST_REF", "SSDI-DEMO-1"),
    }

    agent_number = os.environ.get("SSDI_AGENT_NUMBER", "")
    target_number = os.environ.get("SSDI_TARGET_NUMBER", "")

    logger.info("Starting SSDI Agent records liaison in %s mode", mode)

    if mode == "outbound":
        if not agent_number or not target_number:
            raise SystemExit(
                "outbound mode needs SSDI_AGENT_NUMBER and SSDI_TARGET_NUMBER"
            )
        agent.call_phone(
            from_number=agent_number,
            to_number=target_number,
            variables=variables,
        )
    elif mode == "campaign":
        # Guava's own dialer works the contact list, honoring the campaign's
        # calling windows, concurrency, and retry policy. Each contact's `data`
        # arrives as that call's variables.
        campaign_code = os.environ.get("SSDI_CAMPAIGN_CODE", "")
        if not campaign_code:
            raise SystemExit("campaign mode needs SSDI_CAMPAIGN_CODE")
        logger.info("Attaching to campaign %s", campaign_code)
        agent.attach_campaign(campaign_code)
    elif mode == "inbound":
        if not agent_number:
            raise SystemExit("inbound mode needs SSDI_AGENT_NUMBER")
        agent.listen_phone(agent_number)
    elif mode == "local":
        agent.call_local()
    elif mode == "webrtc":
        agent.listen_webrtc()
    else:
        agent.chat(variables)


if __name__ == "__main__":
    main()
