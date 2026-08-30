"""Turns an SSDI case into the context a records call actually needs.

The web app owns the case. It passes the relevant slice into each call as Guava
variables, so the agent never has to know how the case is stored. The demo case
below is a fallback so `guava run ./agent` works standalone.

Only what a records office legitimately needs to locate and release a record is
carried here: who the patient is, which office, and the treatment window. No
Social Security number, and no clinical narrative.
"""

from __future__ import annotations

import json

# The sample case the web app ships, used when no variables are supplied.
DEMO_CASE = {
    "applicant_name": "Elena Rivera",
    "provider_name": "Sacramento Spine & Rehab",
    "provider_contact": "Dr. Maya Chen",
    "specialty": "Physical medicine and rehabilitation",
    "treatment_start": "2024-11-14",
    "treatment_end": "2026-06-30",
    "conditions": ["Lumbar spinal stenosis", "Chronic migraine"],
    "claim_stage": "initial application",
    "forms_needed": [
        "office visit notes for the treatment window",
        "imaging reports and any MRI or X-ray findings",
        "a medical source statement describing functional limits",
    ],
    "request_reference": "SSDI-DEMO-1",
}

# Keys the web app may pass as call variables.
CONTEXT_KEYS = (
    "applicant_name",
    "provider_name",
    "provider_contact",
    "specialty",
    "treatment_start",
    "treatment_end",
    "conditions",
    "claim_stage",
    "forms_needed",
    "request_reference",
)


def build(call) -> dict:
    """Read case context off the call, falling back to the demo case."""
    context = dict(DEMO_CASE)
    for key in CONTEXT_KEYS:
        value = call.get_variable(key)
        if value in (None, "", []):
            continue
        # Lists may arrive JSON-encoded depending on how the caller sent them.
        if key in ("conditions", "forms_needed") and isinstance(value, str):
            try:
                parsed = json.loads(value)
                value = parsed if isinstance(parsed, list) else [value]
            except ValueError:
                value = [part.strip() for part in value.split(",") if part.strip()]
        context[key] = value
    return context


def _join(items) -> str:
    """Render a list the way a person would say it aloud."""
    items = [str(i) for i in items if str(i).strip()]
    if not items:
        return ""
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return items[0] + " and " + items[1]
    return ", ".join(items[:-1]) + ", and " + items[-1]


def briefing(context: dict) -> str:
    """A plain-language summary the agent can reason from mid-call."""
    lines = [
        "You are calling on behalf of " + str(context["applicant_name"]) + ",",
        "who is filing a Social Security disability claim ("
        + str(context.get("claim_stage", "initial application"))
        + ").",
        "",
        "The office you are calling is " + str(context["provider_name"]) + ".",
    ]
    if context.get("provider_contact"):
        lines.append("The treating clinician there is " + str(context["provider_contact"]) + ".")
    if context.get("specialty"):
        lines.append("Their specialty is " + str(context["specialty"]) + ".")
    lines.append("")
    lines.append(
        "Treatment window you are requesting: "
        + str(context.get("treatment_start", "unknown"))
        + " through "
        + str(context.get("treatment_end", "the present"))
        + "."
    )
    forms = context.get("forms_needed") or []
    if forms:
        lines.append("")
        lines.append("What the claim still needs from this office:")
        for item in forms:
            lines.append("  - " + str(item))
    return "\n".join(lines)


def opening_line(context: dict) -> str:
    """The verbatim first sentence, spoken before any model involvement."""
    return (
        "Hi, this is the S S D I Agent, an automated assistant calling on behalf "
        "of a patient, " + str(context["applicant_name"]) + ", who is applying for "
        "Social Security disability. I'm calling to ask how to request her medical "
        "records from your office. I have a signed S S A eight twenty seven "
        "authorization, and I won't be sharing any sensitive details on this call."
    )
