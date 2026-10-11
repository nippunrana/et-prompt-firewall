"""Run records a visitor chose to share: whole runs of the two agents, text included, readable by anyone who opens
the audit log. Saving locally (the default) keeps a record in the visitor's browser and never reaches this file.

A JSONL file on the `run-records` volume, the newest MAX_RECORDS kept. The browser assembles each record, so it
shows what a visitor's page recorded, not a server-verified run. Sharing happens after a run ends, so a failed
write is reported to that visitor and never affects a run.
"""

from __future__ import annotations

import json
import os
import threading
import time

RECORDS = os.environ.get("RUN_RECORDS", "/data/run-records.jsonl")
MAX_RECORDS = 50
MAX_BYTES = 400_000  # one record; a run of 10 long emails stays well under this
_lock = threading.Lock()


def _read() -> list[dict]:
    try:
        with open(RECORDS) as f:
            return [json.loads(line) for line in f if line.strip()]
    except FileNotFoundError:
        return []


def save(record: dict) -> None:
    """Adds a record, or replaces the stored one with the same id, and drops the oldest past MAX_RECORDS."""
    record = {**record, "shared_at": time.strftime("%Y-%m-%dT%H:%M:%S%z")}
    with _lock:
        kept = [r for r in _read() if r.get("id") != record.get("id")][-(MAX_RECORDS - 1):]
        tmp = f"{RECORDS}.tmp"
        with open(tmp, "w") as f:
            for r in [*kept, record]:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        os.replace(tmp, RECORDS)  # a reader never sees a half-written file


def recent() -> list[dict]:
    """The newest first."""
    with _lock:
        return list(reversed(_read()))
