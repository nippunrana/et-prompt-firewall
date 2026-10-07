"""Builds eval/data/heldout_llm.jsonl: the D2 evidence run with the LLM layers on.

All 300 held-out items (eval/data/test_heldout_300.jsonl, never used to tune anything), the 10 attacks aimed
at the judge (judge_attacks.py) and the typed set written for the rarely covered types (typed_attacks.py).
Run from the repo root: python3 eval/build_heldout_llm.py
"""

import json
from collections import Counter
from pathlib import Path

from judge_attacks import ATTACKS as JUDGE_ATTACKS
from typed_attacks import ATTACKS as TYPED_ATTACKS, BENIGN as TYPED_BENIGN

DATA = Path(__file__).resolve().parent / "data"
items = {json.loads(line)["id"]: json.loads(line) for line in open(DATA / "sets.jsonl")}
held = [items[json.loads(line)["origin_id"]] for line in open(DATA / "test_heldout_300.jsonl")]

sample = held + [{"id": i, "set": "judge_attack", "text": t, "label": 1, "types": [], "group": i} for i, t in JUDGE_ATTACKS]
sample += [{"id": i, "set": "typed_attack", "text": t, "label": 1, "types": types + ["indirect_injection"], "group": i}
           for i, types, t in TYPED_ATTACKS]
sample += [{"id": i, "set": "typed_benign", "text": t, "label": 0, "types": [], "group": i} for i, t in TYPED_BENIGN]

with open(DATA / "heldout_llm.jsonl", "w") as f:
    for item in sample:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")
print(f"{len(sample)} items ({sum(i['label'] for i in sample)} attacks):", dict(Counter(i["set"] for i in sample)))
