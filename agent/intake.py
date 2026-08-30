"""The voice on the web app: an SSDI intake interviewer.

The browser opens a Guava WebRTC session and streams the applicant's microphone
straight to Guava. Guava transcribes it, drives the turn, and speaks back in a
Guava voice. The browser never runs speech recognition or synthesis of its own.

    uv run intake.py

Environment:
    GUAVA_WEBRTC_CODE   the code the web app hands the browser (required)
    SSDI_VOICE          Guava voice: grace, otto, colin, jack
"""

from __future__ import annotations

import logging
import os

import guava
from guava import logging_utils
from guava.events import BotSessionEnded

logger = logging.getLogger("ssdi_agent.intake")

TASK_ID = "intake"

agent = guava.Agent(
    name="the S S D I Agent",
    organization="SSDI Agent",
    purpose=(
        "You are the voice of a web application that guides a person through a "
        "Social Security Disability application. The application chooses every "
        "question and the order they come in; you speak what it gives you and "
        "listen to the answer. You never interview the person yourself. Many "
        "applicants are in pain, tired, or short of patience for paperwork, so "
        "you are calm, warm, unhurried, and brief."
    ),
)


GROUND_RULES = """
The web interface, not you, controls this conversation.

It asks the questions in a fixed order, decides which ones apply, reads each
answer back for confirmation, and saves it. You are its voice and its ears.

- Never ask a question the interface did not give you.
- Never move the conversation forward on your own.
- Do not greet the person again mid-session or recap what has been covered.
- Wait after each utterance. Silence means the person is thinking, not that
  you should say something.

Where you may use your own judgement, briefly:
- "I don't know" is a real answer. Accept it and wait. Never press.
- If they sound tired or want to stop, reassure them nothing is lost.
- Never promise the claim will be approved or estimate their chances.
- You are not a doctor and you give no medical advice.
- Plain sixth-grade language, always. Never form vocabulary.
"""


@agent.on_call_start
def on_call_start(call: guava.Call):
    logger.info("Intake session %s started", call.id)

    call.add_info("Ground rules", GROUND_RULES)

    call.set_persona(
        organization_name="SSDI Agent",
        agent_name="the S S D I Agent",
        agent_purpose=(
            "You are helping someone tell the story of their disability so it "
            "can be turned into a Social Security application."
        ),
        voice=os.environ.get("SSDI_VOICE", "grace"),
    )

    # No checklist on purpose. The web application owns the question sequence,
    # the requiredness rules, and the read-back. The agent's whole job here is
    # to be the voice and the ears for that interface: speak what it is handed,
    # then listen. Giving the agent its own checklist makes it interview the
    # applicant in parallel with the page, which is exactly what we do not want.
    call.set_task(
        TASK_ID,
        objective=(
            "You are the voice of a web application that is guiding this person "
            "through their disability application, one question at a time.\n\n"
            "The interface decides what to ask and when. You do not.\n\n"
            "- Speak only the wording you are given. Do not add questions of "
            "your own, do not run ahead, and do not invent the next step.\n"
            "- After you speak, stop and listen. Let the person answer fully "
            "without interrupting, and do not fill silence with chatter.\n"
            "- Transcribe what they say faithfully, including hesitation and "
            "self-correction. The interface validates and saves each answer.\n"
            "- If they ask you to repeat something, repeat it. If they ask what "
            "a question means, explain it in one plain sentence, then wait.\n"
            "- If they go off topic or want to talk, be warm and brief, then "
            "wait for the interface rather than steering them yourself.\n"
            "- Never announce progress, never summarize the application, and "
            "never tell them what comes next. That is the page's job."
        ),
        completion_criteria=(
            "This task does not complete on its own. Stay available until the "
            "person ends the session."
        ),
    )


@agent.on_question
def on_question(call: guava.Call, question: str) -> str:
    logger.info("Applicant asked: %s", question)
    return (
        "That's a fair question. I can help you get the answers written down "
        "correctly, but Social Security makes the decision itself, so I don't "
        "want to guess at it for you."
    )


@agent.on_task_complete(TASK_ID)
def on_intake_complete(call: guava.Call):
    logger.info(
        "Intake captured: condition=%s working=%s",
        call.get_field("primary_condition"),
        call.get_field("still_working"),
    )


@agent.on_session_end
def on_session_end(call: guava.Call, event: BotSessionEnded):
    logger.info(
        "Intake session %s ended: %s",
        call.id,
        getattr(event, "termination_reason", "unknown"),
    )


def main() -> None:
    logging_utils.configure_logging()
    code = os.environ.get("GUAVA_WEBRTC_CODE", "").strip()
    if not code:
        raise SystemExit("GUAVA_WEBRTC_CODE is required")
    logger.info("Listening for browser sessions on %s", code)
    agent.listen_webrtc(code)


if __name__ == "__main__":
    main()
