# Firewall check (`POST /check`)

The firewall's core API: prepare the text, screen it with rules and two classifiers (PIGuard and Llama Prompt Guard 2 86M), locate the attack, then allow, sanitise or quarantine. Code: `services/firewall/app/` (`prepare.py` → `rules.py` + `classifiers.py` → `locate.py` → `check.py`).

## Rules

- **A single sentence's score never triggers a cut.** Sentence and pair scores only locate the culprit inside a 3-sentence window that already scored high. Short fragments get unreliable scores: a subject line and a shell command both scored 1.0 on PIGuard.
- **Every window is scored, whatever the whole text scored.** One bad line in a long friendly email is diluted in the whole-text score.
- **Language Identification (LID) routes to the `unsure` lane; it never cuts.** Quantized GlotLID v3 (Method 8 + Options B & C) flags non-English and Romanized Indic injections that bypass English classifiers. Flagged lines leave the verdict as `allow` but route `lane` to `unsure` with language metadata for the Phase 3 LLM judge/sandbox.
- **The language gate keeps its own threshold (`LID_THRESHOLD`, 0.50); never pass the classifier threshold into it.** At 0.65 the gate caught no extra attack and sent 48 more of 1,000 real emails to `unsure` (measured 2026-10-06).
- **The language gate scores only the Subject header and the body.** Other header lines (To, From, Cc, Date, Sent, …), address-list lines and HTML markup are skipped: they carry names and codes that read as foreign text. The classifiers and rules still see every line.
- **Never strip only the digits for the language gate.** Words containing a digit are dropped whole; stripping just the digits leaves fragments ("34th" → "th") that read as foreign words (measured: more false flags, no attack gained).
- **Until the LLM judge exists, a classifier flag is cut, but a weak rule hint alone is only reported.** Cutting every "send … to <address>" would gut ordinary email. So a plain-request attack with no override wording ("please send the invoices to audit@…") passes today, on purpose; catching it is the judge's job. Do not "fix" this in either direction without the judge. A weak hint next to real evidence does join the cut (the trigger sentence is often followed by the payload).
- **A classifier failure falls back to the rules and is reported,** never treated as clean.
- **Never load PIGuard with `trust_remote_code`.** `classifiers.py` re-implements its model class so no code from the Hugging Face repo runs. If the pinned revision changes, re-check that the scores match the repo's own `modeling_piguard.py`.
- **A model that fails to load, or fails the start-up self-test, must crash start-up.** The deploy then rolls back. Never catch it to start without classifiers.
- **The classifier threshold is 0.65 (`FIREWALL_THRESHOLD`), but 0.65 vs 0.50 is a near-even trade, not a fix for false positives.** On 300 held-out items it spared 6 benign items and missed 3 attacks outright; about 42% of benign items are cut at either value (2026-10-06). Never report numbers measured on the set a threshold was chosen on.
- **Spans always point into the original text.** Normalised and decoded views are extra; whatever is flagged or cut maps back to what the user sees.

## Packaging

- **The weights are baked into the image, above `COPY app`,** so code changes never re-download them. Revisions are pinned in `app/model_ids.py`.
- **The Hugging Face token reaches the build only as a BuildKit secret** (`hf_token`). Never pass it as `ARG` or `ENV`: those are stored in the image layers. Builds need `HF_TOKEN` (the `.env` on the Mac, the `HF_TOKEN` Actions secret in CI); the server never builds and does not need it.
- **GlotLID is quantised in its own build stage (`app/lid_model.py`); only the 225 MB result enters the image.** Never ship the 1.7 GB `model_v3.bin`, and never mount the model from the host: a missing model made the gate pass every line as English without any error. Start-up now fails instead. The built file is byte-identical to the one the gate was measured with; if `lid_model.py` changes, re-measure the gate.
- **PyTorch is installed only in the Dockerfile, from the CPU index.** Never put `torch` in `requirements.txt`: CI's test job installs that file, and on PyPI `torch` resolves to the multi-gigabyte CUDA build. The tests never import torch.
- **Llama Prompt Guard 2 requires "Built with Llama" attribution** (Llama 4 Community License) wherever the product is shown. Its licence travels with the weights in the image.
