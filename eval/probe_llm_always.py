"""Re-runs the held-out attacks that went through the clean lane (no detector flagged them, so no AI call) with the
judge and the sandbox forced on (llm_always), to see whether running the LLM layers on everything would catch them.
EVAL_PROBE=misses (default) takes the missed attacks; EVAL_PROBE=benign takes the benign items that went through the
clean lane (Enron, boundary-pair twins, LLMail benign, typed twins, CrackedPDFs originals), to measure the false alarms
it adds. Benign items outside the clean lane already had both LLM layers, so forcing them on changes nothing there.

From the repo root:
  set -a; . ./.env; set +a
  docker run --rm -e EVAL_LLM=1 -e GEMINI_API_KEY -e OPENROUTER_API_KEY -v "$PWD/eval:/eval" \
    -v "$PWD/services/firewall/app:/app/app:ro" et-prompt-firewall-firewall:live python /eval/probe_llm_always.py
"""

from __future__ import annotations

import json
import multiprocessing as mp
import os

import run

DATA = run.DATA
PROBE = os.environ.get("EVAL_PROBE", "misses")


def MISSED(r: dict) -> bool:
    if r.get("lane") != "clean":
        return False
    if PROBE == "benign":
        return r["label"] == 0 and r.get("set", "") not in {"html_benign", "docx_benign", "cpdf_benign_confounder", "image_benign", "image_enron"}
    return r["label"] == 1 and r.get("verdict") not in ("sanitise", "quarantine")


def _items() -> list[dict]:
    texts = {json.loads(line)["id"]: json.loads(line) for line in open(DATA / "heldout_llm.jsonl")}
    items = []
    for line in open(DATA / "results-heldout-llm.jsonl"):
        r = json.loads(line)
        item = texts[r["id"]]
        if MISSED({**r, "label": item["label"]}):
            items.append({"id": r["id"], "set": item["set"], "kind": "text", "text": item["text"], "source": r["source"]})
    files = (("results-files-held.jsonl", "files.jsonl"),) + ((("results-images-held.jsonl", "images.jsonl"),) if PROBE == "misses" else ())
    for results, manifest in files:
        paths = {json.loads(line)["id"]: json.loads(line)["path"] for line in open(DATA / manifest)}
        for line in open(DATA / results):
            r = json.loads(line)
            if MISSED(r) and r["format"] != "html":
                items.append({"id": r["id"], "set": r["set"], "kind": r["format"], "path": paths[r["id"]], "source": "document"})
    return items


def _check(item: dict) -> dict:
    from app.check import run_check
    from app.ocr import _sync_process_document
    text, hidden = item.get("text"), None
    if item["kind"] != "text":
        out = _sync_process_document((DATA / "files" / item["path"]).read_bytes(), item["path"])
        text, hidden = out["text"], [(h["kind"], h["start"], h["end"]) for h in out.get("hidden", [])]
    result = run_check(text, item["source"], run._classifiers, judge=run._judge, sandbox=run._sandbox,
                       hidden=hidden, llm_always=True)
    judge, sandbox = result.get("judge") or {}, result.get("sandbox") or {}
    return {"id": item["id"], "set": item["set"], "kind": item["kind"], "verdict": result["verdict"],
            "types": sorted({t for a in result.get("attacks", []) for t in a.get("types", [])}),
            "judge_attack": judge.get("is_attack"), "judge_ok": judge.get("ok"), "sandbox_acted": sandbox.get("acted"),
            "warnings": result.get("warnings", [])}


def main() -> None:
    items = _items()
    print(f"{len(items)} {PROBE} items from the clean lane", flush=True)
    with mp.get_context("spawn").Pool(run.WORKERS, initializer=run._init) as pool:
        rows = pool.map(_check, items)
    (DATA / f"results-llm-always-{PROBE}.jsonl").write_text("".join(json.dumps(r) + "\n" for r in rows))
    for r in rows:
        if PROBE == "misses" or r["verdict"] != "allow":
            print(r, flush=True)
    for name in sorted({r["set"] for r in rows}):
        group = [r for r in rows if r["set"] == name]
        flagged = sum(r["verdict"] in ("sanitise", "quarantine") for r in group)
        print(f"{name}: flagged with the LLM layers forced on: {flagged}/{len(group)}")


if __name__ == "__main__":
    main()
