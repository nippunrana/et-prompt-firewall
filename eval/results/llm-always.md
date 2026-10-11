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

Not re-run in this mode: the HTML and Word benign twins, CrackedPDFs benign look-alikes, and benign images.

**Trade-off.** On these sets, running the LLM layers on everything caught every public attack the detectors missed, with no extra false alarms on real or ordinary email; the cost is more flags on harmless requests written to look like attacks, and the judge's and sandbox's time and calls on every item instead of flagged ones only. The default stays `flagged`; `always` suits agents whose inbox or files hold enough value to pay for it.
