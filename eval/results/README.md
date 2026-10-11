# Evaluation results

Numbers and item IDs only; the email text stays in `eval/data/` (gitignored). Every run is on data the firewall was never tuned on, unless a file says otherwise. Wolf Defender, the firewall's first classifier, was trained on LLMail-Inject, so LLMail results are labelled as such and never count toward a headline.

## Current

| File | What it shows |
| :--- | :--- |
| [heldout-llm.md](heldout-llm.md) | **The headline run.** All 300 held-out items with every layer on, plus our judge-aimed and typed sets reported apart: per set, per attack type, payload survival, latency. |
| [files-held.md](files-held.md) | **Files and web pages with hidden text**, every layer on: CrackedPDFs triplets (injected, benign original, benign look-alike) and public LLMail attacks hidden in HTML and Word files we generated, each with a benign twin; per technique and per PDF attack family. |
| [images-held.md](images-held.md) | **Images (OCR)**, every layer on: the held-out boundary-pair attacks and benign twins and 30 Enron emails, rendered by us as screenshots (text unchanged), with the decision rule written before the run and an item-by-item comparison with the text results. |
| [llm-always.md](llm-always.md) | **The LLM layers on everything** (`llm: "always"`): the clean-lane attacks and benign items re-run with the judge and sandbox forced on; what it catches and what it costs. |
| [files-dev-strong.md](files-dev-strong.md), [files-dev-weak.md](files-dev-weak.md), [files-dev-v2.md](files-dev-v2.md), [files-dev-v3.md](files-dev-v3.md) | The dev split the file decisions were made on (never reported as results): the concealment rule on vs off, then the two fixes and the per-part judge. Measured with PIGuard (2026-10-08). |
| [agent-phase4.md](agent-phase4.md) | The demo agent end to end: 33 attack emails with and without the tool-call guard, and 8 legitimate tasks. Measured on `7be73ca` (Wolf Defender, the instruct agent with twelve tools), 2026-10-11. |
| [scenarios.json](scenarios.json) | The demo scenarios (including credential theft), each run several times unprotected and protected. Measured on `7be73ca` (Wolf Defender), 2026-10-11. |
| [adaptive.md](adaptive.md) | Adaptive attacks: an attacker model rewriting emails against the firewall's feedback, and what got through. Measured on `7be73ca` (Wolf Defender; the attacker is the agent's instruct model), 2026-10-11. |
| [layers-phase3.md](layers-phase3.md) | The same 160 held-out items with the LLM layers off and on: what the judge and sandbox add. Measured with PIGuard (2026-10-07). |
| [v7.md](v7.md) | The detectors alone (rules, Wolf Defender, Prompt Guard 2, language gate; no LLM layers) on 1,203 benign emails (1,000 Enron real work email; 203 LLMail benign emails, in Wolf Defender's training data): the false alarms the judge has to clear. |
| [v6.md](v6.md) | The detectors alone on the full 3,124-item sets, measured with PIGuard. |

## Archive (superseded, kept for the record)

`archive/` holds earlier runs: `piguard-2026-10-10/`, the current reports as measured with PIGuard before Wolf Defender replaced it (2026-10-11; 104/120 public attacks caught, 21/90 payloads surviving); the headline run before the judge ruled on each flagged part (`heldout-llm-f273eaf.md`: same detection, 17/90 payloads surviving vs 21/90 after it), the first baseline (`baseline-8b39d25`, before the language gate and the LLM layers), threshold comparisons (`summary_*.json`) and an early capabilities summary. Their false-positive rates (about 40–50% on real email) describe the detectors before the LLM judge was added, not the current system.
