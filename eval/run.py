"""Run every item in eval/data/sets.jsonl through the firewall's own /check pipeline.

Runs inside the firewall image, calling app.check.run_check directly (the same function /check
calls) in several worker processes, so a benchmark finishes in about an hour instead of five.
Results go to eval/data/results-<label>.jsonl, one line per item, and a rerun skips finished items.
They hold the input text, so they stay in eval/data/ (gitignored); report.py writes the
text-free summary that may be committed.

Run from the repo root (the firewall code is mounted read-only, so the run tests the working tree):
  docker run --rm --cpus 6 --memory 7g -e EVAL_LABEL=baseline-$(git rev-parse --short HEAD) \
    -e EVAL_COMMIT=$(git rev-parse HEAD) -v "$PWD/eval:/eval" \
    -v "$PWD/services/firewall/app:/app/app:ro" et-prompt-firewall-firewall:live python /eval/run.py
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import sys
import time
from pathlib import Path

DATA = Path("/eval/data")
WORKERS = int(os.environ.get("EVAL_WORKERS", "3"))
# Pairs from a user's own chat are sent as `user`; everything else arrives from outside.
USER_CONTEXTS = {"direct_user", "chat_message"}

_classifiers = None


def _init() -> None:
    global _classifiers
    sys.path.insert(0, "/app")
    from app import classifiers
    _classifiers = classifiers.load()


def _check(item: dict) -> dict:
    from app.check import run_check
    source = "user" if item.get("source_context") in USER_CONTEXTS else "email"
    started = time.perf_counter()
    try:
        result = run_check(item["text"], source, _classifiers)
        error = None
    except Exception as exc:  # recorded, never skipped silently
        result, error = {}, f"{type(exc).__name__}: {exc}"
    return {"id": item["id"], "set": item["set"], "source": source, "error": error,
            "ms": round((time.perf_counter() - started) * 1000),
            "verdict": result.get("verdict"), "lane": result.get("lane"), "risk": result.get("risk"),
            "attacks": [{k: a[k] for k in ("types", "span", "found_by", "confidence", "rules") if k in a}
                        for a in result.get("attacks", [])],
            "hints": result.get("hints", []), "warnings": result.get("warnings", []),
            "scores": result.get("scores", {})}


def main() -> None:
    label = os.environ.get("EVAL_LABEL", "run")
    out = DATA / f"results-{label}.jsonl"
    items = [json.loads(line) for line in open(DATA / "sets.jsonl")]
    done = {json.loads(line)["id"] for line in open(out)} if out.exists() else set()
    todo = [i for i in items if i["id"] not in done]
    only = os.environ.get("EVAL_SETS")
    if only:
        todo = [i for i in todo if i["set"] in only.split(",")]
    todo = todo[:int(os.environ.get("EVAL_LIMIT", len(todo)))]
    meta = DATA / f"results-{label}.meta.json"
    if not meta.exists():
        meta.write_text(json.dumps({"label": label, "commit": os.environ.get("EVAL_COMMIT"),
                                    "started": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "workers": WORKERS}))
    print(f"{len(todo)} to run, {len(done)} already done", flush=True)
    started = time.time()
    with mp.get_context("spawn").Pool(WORKERS, initializer=_init) as pool, out.open("a") as f:
        for n, row in enumerate(pool.imap_unordered(_check, todo, chunksize=4), 1):
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            if n % 100 == 0:
                rate = n / (time.time() - started)
                print(f"{n}/{len(todo)}  {rate:.2f}/s  eta {(len(todo) - n) / rate / 60:.0f} min", flush=True)


if __name__ == "__main__":
    main()
