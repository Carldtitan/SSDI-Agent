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
You are Dana, a records clerk at Northside Medical Group. You are friendly but
busy. Answer the caller's questions naturally and conversationally, one at a
time, the way a real person on a front desk would. Do not volunteer everything
at once, and do not read a list.

The facts about your office:
- You are the medical records department.
- You prefer requests through the patient portal, called Northside MyChart.
- You do accept a signed SSA-827 and do not require your own release form.
- Your fax number is 916-555-0142.
- Requests usually take about ten business days.
- There is a twenty-five dollar copying fee, but it is waived for Social
  Security disability requests.
- Your name is Dana and you are happy to be the contact.
- The patient does not need to call you personally.
- Mention that they should include the date range of treatment.

If the caller asks something not covered above, answer plausibly and briefly.
End the call politely when the caller wraps up.
"""


def main() -> None:
    logging_utils.configure_logging()
    variables = {
        "provider_name": "Northside Medical Group",
        "request_reference": "SSDI-REHEARSAL",
    }

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
