# Evaluation results

Numbers and item IDs only; the email text stays in `eval/data/` (gitignored). Every run is on data the firewall was never tuned on, unless a file says otherwise.

## Current

| File | What it shows |
| :--- | :--- |
| [heldout-llm.md](heldout-llm.md) | **The headline run.** All 300 held-out items with every layer on, plus our judge-aimed and typed sets reported apart: per set, per attack type, payload survival, latency. |
| [agent-phase4.md](agent-phase4.md) | The demo agent end to end: 33 attack emails with and without the tool-call guard, and 8 legitimate tasks. |
| [scenarios.json](scenarios.json) | The demo scenarios (including credential theft), each run several times unprotected and protected. |
| [adaptive.md](adaptive.md) | Adaptive attacks: an attacker model rewriting emails against the firewall's feedback, and what got through. |
| [layers-phase3.md](layers-phase3.md) | The same 160 held-out items with the LLM layers off and on: what the judge and sandbox add. |
| [v6.md](v6.md) | The detectors alone (rules, classifiers, language gate; no LLM layers) on the full 3,124-item sets. |

## Archive (superseded, kept for the record)

`archive/` holds earlier runs: the first baseline (`baseline-8b39d25`, before the language gate and the LLM layers), threshold comparisons (`summary_*.json`) and an early capabilities summary. Their false-positive rates (about 40–50% on real email) describe the detectors before the LLM judge was added, not the current system.
