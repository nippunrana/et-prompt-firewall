"""The audit log: one line per content check and per outgoing action the guard decided on, so a person
can see afterwards what the firewall decided on its own. It is the system's oversight; nothing waits for a human.

Stores what was decided and why, never the checked text: a hash and the length identify the content, so a
public demo never keeps what visitors paste. Writing never fails a request.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import time
from collections import deque

log = logging.getLogger(__name__)
AUDIT_LOG = os.environ.get("AUDIT_LOG", "/data/audit.jsonl")


def _append(entry: dict) -> None:
    try:
        with open(AUDIT_LOG, "a") as f:
            f.write(json.dumps({"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), **entry}, ensure_ascii=False) + "\n")
    except OSError:
        log.exception("could not write the audit log")


def record_check(content: str, source: str | None, result: dict) -> None:
    _append({"checkpoint": "check", "source": source or "unknown", "verdict": result["verdict"],
             "lane": result.get("lane"),
             "types": sorted({t for a in result.get("attacks", []) for t in a["types"]}),
             "cuts": len(result.get("attacks", [])),
             "found_by": sorted({f for a in result.get("attacks", []) for f in a.get("found_by", [])}),
             "warnings": result.get("warnings", []),
             "content_sha256": hashlib.sha256(content.encode()).hexdigest()[:16], "content_chars": len(content)})


def record_guard(tool: str, decision: dict) -> None:
    _append({"checkpoint": "guard", "tool": tool, "verdict": decision["decision"], "types": decision["types"],
             "reason": decision["reason"]})


def recent(limit: int) -> list[dict]:
    """The newest entries first."""
    try:
        with open(AUDIT_LOG) as f:
            lines = deque(f, maxlen=limit)
    except FileNotFoundError:
        return []
    return [json.loads(line) for line in reversed(lines)]
