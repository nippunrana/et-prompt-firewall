# LLM layers on everything (`llm: "always"`)

By default the LLM judge and sandbox read only what the rules, classifiers and language gate flag (the clean lane skips them). With `llm: "always"` they read every input. This run measures what that switch changes, on the held-out items, with `eval/probe_llm_always.py` (2026-10-11).

**Method.** The switch only changes the clean lane: every other item already went through both LLM layers. So only held-out items that went through the clean lane were re-run, with both layers forced on: the attacks missed there (`EVAL_PROBE=misses`) and the benign items there (`EVAL_PROBE=benign`). Every other item keeps its result from [heldout-llm.md](heldout-llm.md), [files-held.md](files-held.md) and [images-held.md](images-held.md). One run; LLM answers vary a little from run to run. Nothing was tuned.

## Attacks caught

| Set | Default (`flagged`) | `always` | Re-run from the clean lane |
| :--- | :--- | :--- | :--- |
| **Public, no classifier here trained on** (boundary pairs + CrackedPDFs) | 75/80 (94%) | **80/80 (100%)** | 5, all caught |
| Boundary-pair attacks | 26/30 | 30/30 | 4, all caught |
| CrackedPDFs injected | 49/50 | 50/50 | 1, caught |
| Images (screenshots) | 21/30 | 23/30 | 8, 2 caught |

Every catch came from the judge (it called the item an attack and quoted it); the sandbox never acted on these items.

## Benign items flagged

| Set | Default (`flagged`) | `always` | Re-run from the clean lane |
| :--- | :--- | :--- | :--- |
| Enron real work email | 1/100 | **1/100** | 47, none flagged |
| LLMail benign emails | 0/40 | 0/40 | 40, none flagged |
| CrackedPDFs benign originals | 0/50 | 0/50 | 12, none flagged |
| Typed-set benign twins (ours) | 0/8 | 0/8 | 5, none flagged |
| Boundary-pair benign twins (requests to an AI written to look like attacks) | 8/40 | **14/40** | 23, 6 flagged |
| HTML pages with ordinary hidden content | 0/30 | 0/30 | 29, none flagged |
| Word files with ordinary hidden content | 0/30 | 0/30 | 28, none flagged |
| Enron emails as screenshots | 2/30 | 2/30 | 9, none flagged |
| CrackedPDFs benign look-alikes (ordinary text hidden the way attacks hide) | 11/50 | 12/50 | 9, 1 flagged |
| Boundary-pair benign twins as screenshots | 13/40 | **22/40** | 22, 9 flagged |

## Overall

| | Default (`flagged`) | `always` |
| :--- | :--- | :--- |
| All held-out attacks (292) | 276 (94.5%) | **283 (96.9%)** |
| Ordinary benign content: email, PDFs, HTML, Word, screenshots of email (288) | 3 (1.0%) | **3 (1.0%)** |
| Benign look-alikes built to resemble attacks (130) | 32 (24.6%) | 48 (36.9%) |
| All benign (418) | 35 (8.4%) | 51 (12.2%) |

Every benign item was re-run if it went through the clean lane (224 of 418); the rest already had both LLM layers.

**Trade-off.** Running the LLM layers on everything caught every public attack the detectors missed and 7 more attacks overall, with no extra false alarms on ordinary content (email, PDFs, web pages, Word files); the cost is more flags on harmless content built to look like attacks (24.6% → 36.9%), and the judge's and sandbox's time and calls on every item instead of flagged ones only. The default stays `flagged`; `always` suits agents whose inbox or files hold enough value to pay for it.
