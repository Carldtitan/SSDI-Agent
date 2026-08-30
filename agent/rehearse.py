"""Drive a full records call end to end with no phone involved.

Guava roleplays the records clerk against the real agent, so this exercises the
same handlers, the same task checklist, and the same extraction that a live call
uses. It exists so the twelve-field capture can be demonstrated and regression
tested without depending on a carrier.

    uv run rehearse.py
"""

from __future__ import annotations

import json
import logging

from guava import logging_utils

from main import RESULT_KEYS, agent

logger = logging.getLogger("ssdi_agent.rehearse")

CLERK = """
You are Dana, the medical records coordinator at Sacramento Spine & Rehab. You
are friendly but busy. Answer naturally and conversationally, one thing at a
time, the way a real person on a front desk would. Do not volunteer everything
at once, and never read a list aloud.

The facts about your office:
- You are the medical records department. Dr. Maya Chen practices here.
- You can find Elena Rivera in the system once you are given her name.
- You have her records for the whole 2024 to 2026 period, though anything
  before 2025 is in offsite archive and adds about a week.
- You prefer requests through the patient portal, Sacramento Spine Connect.
- You accept a signed SSA-827 and do not need your own release form.
- Your fax number is 916-555-0142.
- Routine requests take about ten business days.
- There is a twenty-five dollar copying fee, waived for Social Security
  disability requests.
- Dr. Chen will complete a medical source statement, but she charges an extra
  seventy-five dollars for it and needs three weeks.
- The patient does not need to call you personally.
- Ask the caller to include the specific date range on the request.

If the caller asks for the patient's date of birth or Social Security number to
verify, ask for it once. The caller should decline; accept that gracefully and
say the signed authorization is enough. If asked anything not covered above,
answer plausibly and briefly. End the call politely when the caller wraps up.
"""


def main() -> None:
    logging_utils.configure_logging()
    # Empty on purpose: case_context falls back to the sample case, so this
    # rehearsal runs exactly the path a call driven by the web app would.
    variables = {}

    logger.info("Starting roleplay rehearsal")
    session = agent.roleplay(CLERK, variables)

    # The session object exposes fields directly on some SDK versions and via an
    # inner call on others; take whichever is present.
    reader = None
    for candidate in (session, getattr(session, "call", None)):
        if candidate is not None and hasattr(candidate, "get_field"):
            reader = candidate
            break

    captured = {}
    for key in RESULT_KEYS:
        try:
            captured[key] = reader.get_field(key) if reader else None
        except Exception:
            captured[key] = None

    filled = sum(1 for v in captured.values() if v not in (None, "", []))
    print("\n" + "=" * 60)
    print("CAPTURED RECORDS PROCEDURE  (%d of %d fields)" % (filled, len(RESULT_KEYS)))
    print("=" * 60)
    print(json.dumps(captured, indent=2, default=str))

    try:
        print("\n" + "=" * 60)
        print("TRANSCRIPT")
        print("=" * 60)
        print(session.get_transcript())
    except Exception as exc:
        logger.warning("No transcript available: %s", exc)


if __name__ == "__main__":
    main()
