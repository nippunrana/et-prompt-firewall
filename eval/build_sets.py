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
  planted_inbox     the 165 labelled LLMail attacks, each placed among 3 benign emails (known span)
  planted_thread    the same attacks quoted under "-----Original Message-----" in a real Enron reply

An earlier planted set (boundary-pair texts inserted into Enron emails) was withdrawn: its
business-action families read as ordinary requests to a human once inside an email, so they did
not test prompt injection.

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
ATTACKER = "sender@external-mail.example"  # LLMail gives no sender; a neutral outside address
INBOX_SENDERS = ["priya.menon@company.example", "d.okafor@company.example", "lena.fischer@company.example"]
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


def enron_sets(rng: random.Random) -> tuple[list[dict], list[str]]:
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

    return out, [t for _, t in rest if 40 <= len(t.split()) <= 400]


def _attack_email(e: dict) -> str:
    # The attacker's email as the assistant would see it among others: a small header, then the body.
    subject = e["subject"].strip()
    return f"From: {ATTACKER}\nSubject: {subject}\n\n{e['body'].strip()}" if subject else \
        f"From: {ATTACKER}\n\n{e['body'].strip()}"


def planted_sets(enron_carriers: list[str]) -> list[dict]:
    """The 165 labelled LLMail attacks, each proven to hijack an email assistant, placed at a known
    position in two realistic settings:
      planted_inbox   among three benign emails the assistant is asked to process (LLMail's own
                      scenario); the benign emails are Microsoft's synthetic ones.
      planted_thread  quoted under "-----Original Message-----" in a real Enron reply (local only).
    The span is the whole attacker email, header included: everything in it is attacker-written."""
    rng = random.Random(SEED + 1)  # separate stream: the other sets stay exactly as they were
    labelled = json.load(open(LABELS / "llmail_p2_sample.json"))
    labels = json.load(open(LABELS / "llmail_p2_labels.json"))
    clusters = json.load(open(LABELS / "llmail_p2_clusters.json"))
    benign = [e.replace("Subject of the email:", "Subject:", 1).replace("   Body:", "\n\n", 1)
              for e in json.load(open(DATA / "emails_for_fp_tests.json"))]
    carriers = enron_carriers[:]
    rng.shuffle(carriers)
    if len(carriers) < len(labelled):
        raise SystemExit(f"only {len(carriers)} Enron carriers for {len(labelled)} planted attacks")
    out = []
    for i, e in enumerate(labelled, 1):
        types = [LABEL_NAMES.get(t, t) for t in labels[e["id"]]["types"]] + LLMAIL_CONSTANT
        attack = _attack_email(e)
        base = {"label": 1, "types": types, "group": f"family-{clusters[e['id']]}", "attack_id": e["id"]}

        others = [f"From: {INBOX_SENDERS[k % len(INBOX_SENDERS)]}\n{t}" for k, t in enumerate(rng.sample(benign, 3))]
        at = rng.randrange(4)  # the attack's place among the four emails
        parts, span = [], None
        for k, body in enumerate(others[:at] + [attack] + others[at:]):
            block = f"--- Email {k + 1} of 4 ---\n"
            pos = sum(len(x) for x in parts) + len(block)
            if k == at:
                span = [pos, pos + len(attack)]
            parts.append(block + body + "\n\n")
        out.append({**base, "id": f"PI-{i:03d}", "set": "planted_inbox", "text": "".join(parts).rstrip(), "span": span})

        reply = carriers[i - 1]
        head = f"{reply}\n\n-----Original Message-----\n"
        out.append({**base, "id": f"PT-{i:03d}", "set": "planted_thread", "text": head + attack,
                    "span": [len(head), len(head) + len(attack)]})
    return out


def main() -> None:
    rng = random.Random(SEED)
    rows = llmail_sets(rng)
    pairs, _ = pair_sets()
    enron, carriers = enron_sets(rng)
    rows += pairs + enron + planted_sets(carriers)
    with open(DATA / "sets.jsonl", "w") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    counts = defaultdict(int)
    for r in rows:
        counts[r["set"]] += 1
    print(dict(counts), "total", len(rows))


if __name__ == "__main__":
    main()
