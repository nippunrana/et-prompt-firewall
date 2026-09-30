"""Download the public evaluation data into eval/data/ (gitignored).

Sources (all public; credit them wherever results are shown):
  - LLMail-Inject, Phase 2 (Microsoft, MIT): real adaptive attacks on an email assistant, plus
    203 benign emails Microsoft wrote for false-positive tests.
  - Agentic prompt-injection boundary pairs (3nesdeniz, CC-BY-4.0): 600 attacks in 12 families,
    each with a near-identical benign twin.
  - Enron email corpus (CMU May-2015 release via corbt/enron-emails; no licence, research use):
    a random sample of real work email. It holds real people's details, so it is never committed,
    never shown in the demo, and only aggregate numbers are reported.

Run in a container (the Enron step needs pyarrow; nothing is installed on the host):
  docker run --rm -v "$PWD/eval:/eval" python:3.12-slim sh -c "pip -q install pyarrow && python /eval/fetch_data.py"
Skips files that already exist.
"""

from __future__ import annotations

import json
import random
import urllib.request
from pathlib import Path

DATA = Path(__file__).parent / "data"
HF = "https://huggingface.co/datasets"
LLMAIL = f"{HF}/microsoft/llmail-inject-challenge/resolve/main/data"
PAIRS = f"{HF}/3nesdeniz/agentic-prompt-injection-boundary-pairs/resolve/main/data"
ENRON = f"{HF}/corbt/enron-emails/resolve/main/data/train-0000{{}}-of-00003.parquet"
ENRON_SEED = 20260930
ENRON_SAMPLE = 2500


def download(url: str, name: str) -> None:
    path = DATA / name
    if path.exists():
        print(f"have  {name}")
        return
    print(f"fetch {name}")
    tmp = path.with_suffix(path.suffix + ".part")
    urllib.request.urlretrieve(url, tmp)
    tmp.rename(path)


def fetch_enron() -> None:
    """Sample Enron from all three Parquet shards. Needs pyarrow, so run this script in a container."""
    path = DATA / "enron_sample.jsonl"
    if path.exists():
        print("have  enron_sample.jsonl")
        return
    import pyarrow.parquet as pq  # only this step needs it

    for i in range(3):
        download(ENRON.format(i), f"enron_{i}.parquet")
    table = [pq.read_table(DATA / f"enron_{i}.parquet", columns=["message_id", "subject", "body"]).to_pylist()
             for i in range(3)]
    rows = [r for shard in table for r in shard]
    rng = random.Random(ENRON_SEED)
    with path.open("w") as f:
        for r in rng.sample(rows, ENRON_SAMPLE):
            f.write(json.dumps({"id": r["message_id"], "subject": r["subject"] or "", "body": r["body"] or ""},
                               ensure_ascii=False) + "\n")
    for i in range(3):
        (DATA / f"enron_{i}.parquet").unlink()  # the sample is all we keep


def main() -> None:
    DATA.mkdir(exist_ok=True)
    download(f"{LLMAIL}/raw_submissions_phase2.jsonl", "raw_phase2.jsonl")
    download(f"{LLMAIL}/emails_for_fp_tests.json", "emails_for_fp_tests.json")
    for split in ("train", "validation", "test"):
        download(f"{PAIRS}/{split}.jsonl", f"bp_{split}.jsonl")
    fetch_enron()


if __name__ == "__main__":
    main()
