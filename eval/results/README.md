# Evaluation results

Numbers and item IDs only; the email text stays in `eval/data/` (gitignored). Every run is on data the firewall was never tuned on, unless a file says otherwise.

## Current

| File | What it shows |
| :--- | :--- |
| [heldout-llm.md](heldout-llm.md) | **The headline run.** All 300 held-out items with every layer on, plus our judge-aimed and typed sets reported apart: per set, per attack type, payload survival, latency. |
| [files-held.md](files-held.md) | **Files and web pages with hidden text**, every layer on: CrackedPDFs triplets (injected, benign original, benign look-alike) and public LLMail attacks hidden in HTML and Word files we generated, each with a benign twin; per technique and per PDF attack family. |
| [files-dev-strong.md](files-dev-strong.md), [files-dev-weak.md](files-dev-weak.md), [files-dev-v2.md](files-dev-v2.md), [files-dev-v3.md](files-dev-v3.md) | The dev split the file decisions were made on (never reported as results): the concealment rule on vs off, then the two fixes and the per-part judge. |
| [agent-phase4.md](agent-phase4.md) | The demo agent end to end: 33 attack emails with and without the tool-call guard, and 8 legitimate tasks. Measured on `f273eaf`, before the judge ruled on each flagged part (2026-10-08). |
| [scenarios.json](scenarios.json) | The demo scenarios (including credential theft), each run several times unprotected and protected. Measured on `42d8f09`, before the per-part judge. |
| [adaptive.md](adaptive.md) | Adaptive attacks: an attacker model rewriting emails against the firewall's feedback, and what got through. Measured on `42d8f09`, before the per-part judge. |
| [layers-phase3.md](layers-phase3.md) | The same 160 held-out items with the LLM layers off and on: what the judge and sandbox add. |
| [v6.md](v6.md) | The detectors alone (rules, classifiers, language gate; no LLM layers) on the full 3,124-item sets. |

## Archive (superseded, kept for the record)

`archive/` holds earlier runs: the headline run before the judge ruled on each flagged part (`heldout-llm-f273eaf.md`: same detection, 17/90 payloads surviving vs 21/90 now), the first baseline (`baseline-8b39d25`, before the language gate and the LLM layers), threshold comparisons (`summary_*.json`) and an early capabilities summary. Their false-positive rates (about 40–50% on real email) describe the detectors before the LLM judge was added, not the current system.
