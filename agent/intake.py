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
        "You help a person apply for Social Security Disability Insurance by "
        "talking with them. Many callers are in pain, tired, or short of "
        "patience for paperwork, so you are calm, warm, and unhurried. You use "
        "plain sixth-grade language and never government form vocabulary: ask "
        "'who have you seen about your back?' rather than 'list your treating "
        "sources'. You ask one thing at a time and you read back what you heard "
        "before moving on."
    ),
)


GROUND_RULES = """
How to conduct this conversation:
- One question at a time. Never stack two questions in one turn.
- After the person answers something substantive, briefly read it back in your
  own words and ask if you got it right before moving on.
- If they sound tired or say they need a break, offer to stop and reassure them
  that nothing is lost.
- "I don't know" is a real answer. Accept it, note it, and move on. Never press.
- Never promise the claim will be approved, and never estimate their chances.
  You help them tell their story completely; Social Security decides.
- You are not a doctor and you do not give medical advice.
- If they ask what something is for, explain in one plain sentence.
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

    call.set_task(
        TASK_ID,
        objective=(
            "Help the person describe their condition, who has treated them, "
            "and how the condition limits their work. Follow their lead: if the "
            "web page is guiding the conversation, answer what it puts to you "
            "and let it set the pace."
        ),
        checklist=[
            guava.Say(
                "Hi, I'm the S S D I Agent. I'll help you put together your "
                "disability application. We can go at whatever pace you like, "
                "and you can stop me any time."
            ),
            guava.Field(
                key="primary_condition",
                field_type="text",
                description=(
                    "Ask, in plain words, what health condition is making it "
                    "hard for them to work. Take it in their own words."
                ),
            ),
            guava.Field(
                key="condition_started",
                field_type="text",
                description=(
                    "Roughly when it started or got bad enough to affect work. "
                    "An approximate month or season is fine."
                ),
                required=False,
            ),
            guava.Field(
                key="treating_providers",
                field_type="text",
                description=(
                    "Who has treated them for it: doctors, clinics, hospitals. "
                    "Ask 'who else?' until they say that is everyone."
                ),
                required=False,
            ),
            guava.Field(
                key="work_limits",
                field_type="text",
                description=(
                    "The specific things they can no longer do at work. Ask for "
                    "concrete examples, like lifting, standing, or concentrating."
                ),
                required=False,
            ),
            guava.Field(
                key="still_working",
                field_type="multiple_choice",
                choices=["yes", "no", "reduced_hours"],
                description="Whether they are working for pay right now.",
                required=False,
            ),
            "Tell them what you have so far and what usually comes next.",
        ],
        completion_criteria=(
            "Complete once they have described the condition and you have read "
            "it back to them. Everything else is a bonus. If they want to stop, "
            "the task is complete: thank them and reassure them their answers "
            "are saved."
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
