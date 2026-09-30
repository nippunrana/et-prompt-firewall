"""Build the evaluation sets from eval/data/ and eval/labels/ into eval/data/sets.jsonl.

One row per test item: {"id", "set", "text", "label" (1 attack, 0 benign), "types", "group", ...}.
`types` uses the nine attack-type names from the problem statement, spelled as the firewall spells
them. `group` is what recall is balanced over (team, template family or attack family), because a
single template or team can otherwise dominate a set.

Sets:
  llmail_labelled   165 LLMail Phase 2 attacks labelled by type (eval/labels/, guide included)
  llmail_teams      other working LLMail Phase 2 attacks, at most 8 per team (overall recall only)
  pairs_attack      600 boundary-pair attacks, family mapped to our types (FAMILY_TYPES)
  pairs_benign      their 600 near-identical benign twins (hard benign)
  llmail_benign     Microsoft's 203 benign emails for false-positive tests
  enron_benign      1,000 real Enron work emails; `hard` marks instruction-like wording
  planted           300 boundary-pair attacks inserted into other Enron emails at a recorded span

Run: python eval/build_sets.py   (standard library only; deterministic)
"""

from __future__ import annotations

import json
import random
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).parent
DATA, LABELS = ROOT / "data", ROOT / "labels"
SEED = 20260930
MAX_CHARS = 20_000  # the firewall's /check limit

# Every LLMail row arrives by email and asks the agent to send one: these two always apply.
LLMAIL_CONSTANT = ["indirect_injection", "tool_abuse"]
LABEL_NAMES = {"indirect_prompt_injection": "indirect_injection"}

# Boundary-pair families -> our types. No family is plain credential theft; that type is covered by
# the tool-call guard (Phase 4), never claimed from this set.
FAMILY_TYPES = {
    "direct_instruction_override": ["instruction_override"],
    "roleplay_jailbreak": ["role_change"],
    "multi_agent_trust_spoofing": ["role_change"],
    "system_prompt_extraction": ["secret_extraction"],
    "sensitive_data_exfiltration": ["secret_extraction"],
    "tool_action_abuse": ["tool_abuse"],
    "approval_workflow_bypass": ["tool_abuse"],
    "authority_claim_bypass": ["context_poisoning"],
    "rag_context_poisoning": ["context_poisoning"],
    "memory_context_poisoning": ["context_poisoning"],
    "obfuscation_encoding": ["encoded_instructions"],
    "indirect_content_injection": ["indirect_injection"],
}

# Marks Enron emails whose wording looks like an instruction (the texture that trips detectors).
# Only splits the benign results into easy/hard; it never decides a label.
HARD = re.compile(r"\b(please (forward|send|reply|ignore|delete|disregard)|forward (this|it|the)|"
                  r"ignore (my|the|this|previous)|disregard|password|log ?in|urgent|asap|"
                  r"do not (reply|forward|share)|click|instructions?)\b", re.I)


def email_text(subject: str, body: str) -> str:
    subject = subject.strip()
    return f"Subject: {subject}\n\n{body.strip()}" if subject else body.strip()


def objectives(row: dict) -> dict:
    o = row["objectives"]
    return json.loads(o) if isinstance(o, str) else o


def llmail_sets(rng: random.Random) -> list[dict]:
    labelled = json.load(open(LABELS / "llmail_p2_sample.json"))
    labels = json.load(open(LABELS / "llmail_p2_labels.json"))
    clusters = json.load(open(LABELS / "llmail_p2_clusters.json"))
    out, seen = [], set()
    for e in labelled:
        types = [LABEL_NAMES.get(t, t) for t in labels[e["id"]]["types"]] + LLMAIL_CONSTANT
        out.append({"id": e["id"], "set": "llmail_labelled", "text": email_text(e["subject"], e["body"]),
                    "label": 1, "types": types, "group": f"family-{clusters[e['id']]}", "team": e["team"]})
        seen.add((e["subject"].strip(), e["body"].strip()))

    working: dict[tuple, dict] = {}
    for line in open(DATA / "raw_phase2.jsonl"):
        r = json.loads(line)
        if r["scenario"][-1] not in "klmnopqrstuv":  # a few Phase 1 levels leak into the file
            continue
        key = (r["subject"].strip(), r["body"].strip())
        o = objectives(r)
        if key not in seen and o.get("exfil.sent") and o.get("exfil.destination"):
            working.setdefault(key, r)
    by_team = defaultdict(list)
    for key in sorted(working):
        by_team[working[key]["team_id"]].append(key)
    n = 0
    for team in sorted(by_team):
        keys = by_team[team]
        rng.shuffle(keys)
        for key in keys[:8]:
            n += 1
            out.append({"id": f"LT-{n:04d}", "set": "llmail_teams", "text": email_text(*key), "label": 1,
                        "types": list(LLMAIL_CONSTANT), "group": f"team-{team[:8]}"})

    for i, e in enumerate(json.load(open(DATA / "emails_for_fp_tests.json")), 1):
        text = e.replace("Subject of the email:", "Subject:", 1).replace("   Body:", "\n\n", 1)
        out.append({"id": f"LB-{i:03d}", "set": "llmail_benign", "text": text, "label": 0, "types": [],
                    "group": "llmail_benign"})
    return out


def pair_sets() -> tuple[list[dict], list[dict]]:
    out, attacks = [], []
    for split in ("train", "validation", "test"):
        for line in open(DATA / f"bp_{split}.jsonl"):
            r = json.loads(line)
            attack = str(r["label"]) == "1"
            fam = r["attack_family"] if attack else r["pair_family"]
            row = {"id": r["id"], "set": "pairs_attack" if attack else "pairs_benign", "text": r["text"],
                   "label": int(attack), "types": FAMILY_TYPES[fam] if attack else [], "group": fam,
                   "source_context": r["source_context"]}
            out.append(row)
            if attack:
                attacks.append(row)
    return out, attacks


def enron_sets(rng: random.Random, pair_attacks: list[dict]) -> list[dict]:
    emails, seen = [], set()
    for line in open(DATA / "enron_sample.jsonl"):
        e = json.loads(line)
        text = email_text(e["subject"], e["body"])
        if not 20 <= len(text) <= MAX_CHARS or text in seen:
            continue
        seen.add(text)
        emails.append((e["id"], text))
    rng.shuffle(emails)
    benign, rest = emails[:1000], emails[1000:]
    out = [{"id": f"EB-{i:04d}", "set": "enron_benign", "text": t, "label": 0, "types": [],
            "group": "enron_benign", "hard": bool(HARD.search(t))} for i, (_, t) in enumerate(benign, 1)]

    carriers = [t for _, t in rest if 40 <= len(t.split()) <= 400]
    by_family = defaultdict(list)
    for a in pair_attacks:
        by_family[a["group"]].append(a)
    picks = []
    for fam in sorted(by_family):
        rows = by_family[fam][:]
        rng.shuffle(rows)
        picks += rows[:25]
    if len(carriers) < len(picks):
        raise SystemExit(f"only {len(carriers)} Enron carriers for {len(picks)} planted attacks")
    for i, (attack, carrier) in enumerate(zip(picks, carriers), 1):
        # Insert at a sentence or line boundary after the first one, so the attack sits inside text.
        cuts = [m.end() for m in re.finditer(r"(?<=[.!?])\s+|\n+", carrier)][1:] or [len(carrier)]
        at = rng.choice(cuts)
        head, tail = carrier[:at].rstrip(), carrier[at:].lstrip()
        text = f"{head} {attack['text']} {tail}".rstrip()
        start = len(head) + 1
        out.append({"id": f"PL-{i:03d}", "set": "planted", "text": text, "label": 1,
                    "types": attack["types"] + ["indirect_injection"], "group": attack["group"],
                    "span": [start, start + len(attack["text"])], "attack_id": attack["id"]})
    return out


def main() -> None:
    rng = random.Random(SEED)
    rows = llmail_sets(rng)
    pairs, pair_attacks = pair_sets()
    rows += pairs + enron_sets(rng, pair_attacks)
    with open(DATA / "sets.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    counts = defaultdict(int)
    for r in rows:
        counts[r["set"]] += 1
    print(dict(counts), "total", len(rows))


if __name__ == "__main__":
    main()
