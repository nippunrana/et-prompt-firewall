"""Builds eval/data/layers_sample.jsonl: the Phase 3 test sample.

Half of every held-out category (eval/data/test_heldout_300.jsonl, never used to tune anything),
drawn with a fixed seed, plus the attacks aimed at the judge (judge_attacks.py).
Run from the repo root: python3 eval/build_layers_sample.py
"""

import json
import random
from collections import defaultdict
from pathlib import Path

from judge_attacks import ATTACKS

DATA = Path(__file__).resolve().parent / "data"
held = [json.loads(line) for line in open(DATA / "test_heldout_300.jsonl")]
items = {json.loads(line)["id"]: json.loads(line) for line in open(DATA / "sets.jsonl")}

by_category = defaultdict(list)
for h in held:
    by_category[h["category"]].append(items[h["origin_id"]])
rng = random.Random(7)
sample = []
for category in sorted(by_category):
    pool = sorted(by_category[category], key=lambda i: i["id"])
    sample += rng.sample(pool, len(pool) // 2)
sample += [{"id": i, "set": "judge_attack", "text": t, "label": 1, "types": [], "group": i} for i, t in ATTACKS]

with open(DATA / "layers_sample.jsonl", "w") as f:
    for item in sample:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")
counts = defaultdict(int)
for item in sample:
    counts[item["set"]] += 1
print(f"{len(sample)} items ({sum(i['label'] for i in sample)} attacks):", dict(counts))
