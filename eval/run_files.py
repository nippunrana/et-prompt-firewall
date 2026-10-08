"""Run every file in eval/data/files.jsonl the way POST /check-file does: HTML as HTML, other files
extracted with their hidden text marked, then app.check.run_check.

Results go to eval/data/results-<label>.jsonl (they hold no file text; a rerun skips finished items).
EVAL_SPLIT picks dev or held; EVAL_LLM=1 switches on the judge and the sandbox (paid: small sets only);
FIREWALL_HIDDEN_STRONG=0 turns off "any signal on hidden text blocks it", for the dev comparison.

From the repo root:
  set -a; . ./.env; set +a
  docker run --rm --name eval-files --cpus 6 --memory 7g -e EVAL_LABEL=files-held -e EVAL_SPLIT=held \
    -e EVAL_LLM=1 -e EVAL_WORKERS=3 -e EVAL_COMMIT=$(git rev-parse HEAD) -e GEMINI_API_KEY -e OPENROUTER_API_KEY \
    -v "$PWD/eval:/eval" -v "$PWD/services/firewall/app:/app/app:ro" et-prompt-firewall-firewall:live python /eval/run_files.py
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os
import time

import run  # the text runner: model loading and call counting are shared

DATA = run.DATA


def _norm(text: str | None) -> str:
    return " ".join((text or "").split()).lower()


def _check(item: dict) -> dict:
    from app.check import run_check
    from app.ocr import _sync_process_document
    started = time.perf_counter()
    try:
        data = (DATA / "files" / item["path"]).read_bytes()
        if item["format"] == "html":
            text, fmt, hidden, source, method = data.decode("utf-8", errors="replace"), "html", None, "web", "html"
        else:
            out = _sync_process_document(data, item["path"])
            text, fmt, source, method = out["text"], None, "document", out["method"]
            hidden = [(h["kind"], h["start"], h["end"]) for h in out.get("hidden", [])]
        if run.LLM:
            run._judge.n = run._sandbox.n = 0
            result = run_check(text, source, run._classifiers, judge=run._judge, sandbox=run._sandbox, fmt=fmt, hidden=hidden)
        else:
            result = run_check(text, source, run._classifiers, fmt=fmt, hidden=hidden)
        error = None
    except Exception as exc:  # recorded, never skipped silently
        result, error, method = {}, f"{type(exc).__name__}: {exc}", None
    clean = result.get("clean_content")
    return {"id": item["id"], "set": item["set"], "split": item["split"], "format": item["format"],
            "technique": item["technique"], "rendering": item.get("rendering"), "label": item["label"],
            "method": method, "error": error, "ms": round((time.perf_counter() - started) * 1000),
            "verdict": result.get("verdict"), "lane": result.get("lane"),
            "attacks": [{k: a[k] for k in ("types", "hidden_in", "found_by", "confidence", "rules") if k in a}
                        for a in result.get("attacks", [])],
            "warnings": result.get("warnings", []), "scores": result.get("scores", {}),
            # the hidden attack text is gone from what the agent receives (self-made files, where it is known)
            "payload_gone": None if not item.get("probe") or clean is None else _norm(item["probe"]) not in _norm(clean),
            "judge": result.get("judge"), "sandbox": {k: v for k, v in (result.get("sandbox") or {}).items() if k != "calls"},
            "judge_calls": run._judge.n if run.LLM else 0, "sandbox_calls": run._sandbox.n if run.LLM else 0,
            "usage": result.get("usage")}


def main() -> None:
    label = os.environ.get("EVAL_LABEL", "files")
    out = DATA / f"results-{label}.jsonl"
    split = os.environ.get("EVAL_SPLIT", "dev")
    items = [json.loads(line) for line in open(DATA / "files.jsonl")]
    done = {json.loads(line)["id"] for line in open(out)} if out.exists() else set()
    todo = [i for i in items if i["split"] == split and i["id"] not in done]
    meta = DATA / f"results-{label}.meta.json"
    if not meta.exists():
        meta.write_text(json.dumps({"label": label, "split": split, "commit": os.environ.get("EVAL_COMMIT"), "llm": run.LLM,
                                    "hidden_strong": os.environ.get("FIREWALL_HIDDEN_STRONG", "1"),
                                    "started": time.strftime("%Y-%m-%dT%H:%M:%S%z")}))
    print(f"{len(todo)} to run, {len(done)} already done", flush=True)
    with mp.get_context("spawn").Pool(run.WORKERS, initializer=run._init) as pool, out.open("a") as f:
        for n, row in enumerate(pool.imap_unordered(_check, todo, chunksize=1), 1):
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
            f.flush()
            if n % 20 == 0:
                print(f"{n}/{len(todo)}", flush=True)


if __name__ == "__main__":
    main()
