"""Summarises format-aware input runs (eval/data/results-<label>.jsonl from run_files.py) into
eval/results/<label>.md: numbers only, no file text.

  python3 eval/report_files.py files-dev-strong files-dev-weak   # one table per run
"""

from __future__ import annotations

import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SETS = [("html_attack", "HTML: LLMail attacks hidden in our carrier pages"),
        ("html_benign", "HTML: the same pages with ordinary hidden content"),
        ("docx_attack", "Word: LLMail attacks hidden in our carrier files"),
        ("docx_benign", "Word: the same files with ordinary hidden content"),
        ("cpdf_injected_attack", "PDF (CrackedPDFs): injected"),
        ("cpdf_benign_confounder", "PDF (CrackedPDFs): benign look-alike (same hiding, benign text)"),
        ("cpdf_benign_original", "PDF (CrackedPDFs): benign original")]


def _flagged(r: dict) -> bool:
    return r["verdict"] in ("sanitise", "quarantine")


def _pct(n: int, d: int) -> str:
    return f"{n}/{d} ({100 * n / d:.0f}%)" if d else "–"


def summarise(label: str) -> str:
    rows = [json.loads(line) for line in open(ROOT / "data" / f"results-{label}.jsonl")]
    meta = json.loads((ROOT / "data" / f"results-{label}.meta.json").read_text())
    summary = {"commit": meta.get("commit"), "files": len(rows), "errors": sum(1 for r in rows if r["error"]), "sets": []}
    out = [f"# {label}", "",
           f"Split `{meta['split']}`, commit `{(meta.get('commit') or '')[:7]}`, LLM layers {'on' if meta.get('llm') else 'off'}, "
           f"concealment rule (`FIREWALL_HIDDEN_STRONG`) {'on' if meta.get('hidden_strong') == '1' else 'off'}. "
           f"{len(rows)} files, {sum(1 for r in rows if r['error'])} errors.", "",
           "| Set | Files | Flagged | Cut located in hidden text | Hidden payload gone from what the agent gets |",
           "| :--- | ---: | ---: | ---: | ---: |"]
    for key, name in SETS:
        group = [r for r in rows if r["set"] == key and not r["error"]]
        if not group:
            continue
        located = sum(1 for r in group if any(a.get("hidden_in") for a in r["attacks"]))
        gone = [r for r in group if r["payload_gone"] is not None]
        summary["sets"].append({"set": key, "label": name, "attack": bool(group[0]["label"]), "n": len(group),
                                "flagged": sum(map(_flagged, group)), "located": located if group[0]["label"] else None,
                                "payload_n": len(gone), "payload_gone": sum(r["payload_gone"] for r in gone)})
        out.append(f"| {name} | {len(group)} | {_pct(sum(map(_flagged, group)), len(group))} | "
                   f"{_pct(located, len(group)) if group[0]['label'] else '–'} | "
                   f"{_pct(sum(r['payload_gone'] for r in gone), len(gone)) if gone else '–'} |")
    out += ["", "**Per hiding technique** (attacks flagged · benign twins flagged):", "",
            "| Format | Technique | Attacks flagged | Benign flagged |", "| :--- | :--- | ---: | ---: |"]
    by = defaultdict(lambda: {0: [], 1: []})
    for r in rows:
        if not r["error"]:
            tech = r["rendering"] if r["format"] == "pdf" else r["technique"]
            by[(r["format"], tech)][r["label"]].append(r)
    for (fmt, tech), g in sorted(by.items()):
        out.append(f"| {fmt} | {tech} | {_pct(sum(map(_flagged, g[1])), len(g[1]))} | {_pct(sum(map(_flagged, g[0])), len(g[0]))} |")
    pdf_family = defaultdict(list)
    for r in rows:
        if r["set"] == "cpdf_injected_attack" and not r["error"]:
            pdf_family[r["technique"]].append(r)
    if pdf_family:
        out += ["", "**CrackedPDFs injected, per attack family:**", "", "| Family | Flagged |", "| :--- | ---: |"]
        out += [f"| {fam} | {_pct(sum(map(_flagged, g)), len(g))} |" for fam, g in sorted(pdf_family.items())]
    ms = [r["ms"] for r in rows if not r["error"]]
    out += ["", f"Median {statistics.median(ms) / 1000:.1f} s per file; {sum(r['judge_calls'] for r in rows)} judge calls, "
            f"{sum(r['sandbox_calls'] for r in rows)} sandbox runs.", ""]
    summary["median_s"] = round(statistics.median(ms) / 1000, 1)
    summary["judge_failed"] = sum(1 for r in rows if r["judge"] and not r["judge"]["ok"])
    (ROOT / "results" / f"{label}.json").write_text(json.dumps(summary, indent=1) + "\n")
    return "\n".join(out)


if __name__ == "__main__":
    for label in sys.argv[1:]:
        text = summarise(label)
        (ROOT / "results" / f"{label}.md").write_text(text)
        print(text)
