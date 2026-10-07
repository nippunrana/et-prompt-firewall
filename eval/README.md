# Evaluation harness

Measures the firewall on public data it was not trained on: attacks caught (recall), benign content flagged (false-positive rate), per attack type, and whether the cut lands on the attack.

| Set | Items | What it tests |
| :--- | :--- | :--- |
| `llmail_labelled` | 165 | Real adaptive attacks from [LLMail-Inject](https://huggingface.co/datasets/microsoft/llmail-inject-challenge) Phase 2 that hijacked an email assistant, labelled by attack type ([labels/](labels/)) |
| `llmail_teams` | 226 | More working Phase 2 attacks, at most 8 per team |
| `pairs_attack` / `pairs_benign` | 600 / 600 | [Boundary pairs](https://huggingface.co/datasets/3nesdeniz/agentic-prompt-injection-boundary-pairs): 12 attack families, each with a near-identical benign twin |
| `llmail_benign` | 203 | Microsoft's benign emails written for false-positive tests |
| `enron_benign` | 1,000 | Real work email (Enron corpus, random sample) |
| `planted_inbox` / `planted_thread` | 165 / 165 | The labelled LLMail attacks at a known position: among 3 benign emails the assistant must process, or quoted in a real Enron reply (localisation) |

**Why these sets.** PIGuard was trained on BIPIA, deepset, HackAPrompt, InjecAgent and others, so those would flatter it; none of the sets above is in its training data. Prompt Guard 2's training data is not published; every set here was released after it.

**Limits.** The LLMail type labels were assigned by an AI labeller following [labels/labelling-guide.md](labels/labelling-guide.md) and checked by a second, blind AI labeller (29/30 exact agreement), not by humans. Many LLMail attacks share templates, so results are also reported per template family and per team. Four boundary-pair families (approval-workflow bypass, authority-claim bypass, tool-action abuse, sensitive-data exfiltration) rarely address the AI and read as ordinary requests to a person inside an email; they are reported separately as unsafe-action requests (the tool-call guard's job), never blended into injection recall. Enron text is real personal email: it is never committed or displayed, and only aggregate numbers are reported.

## Run

```sh
# 1. Data (into eval/data/, gitignored). The Enron step needs pyarrow, so run it in a container.
docker run --rm -v "$PWD/eval:/eval" python:3.12-slim sh -c "pip -q install pyarrow && python /eval/fetch_data.py"
# 2. Test sets
python3 eval/build_sets.py
# 3. Run the firewall's own check on every item (inside the firewall image, working-tree code)
docker run --rm --name eval-mine --cpus 9 --memory 7g -e EVAL_LABEL=mine -e EVAL_WORKERS=7 -e TORCH_THREADS=1 \
  -e EVAL_COMMIT=$(git rev-parse HEAD) -v "$PWD/eval:/eval" \
  -v "$PWD/services/firewall/app:/app/app:ro" et-prompt-firewall-firewall:live python /eval/run.py
# 4. Summary (numbers only) into eval/results/
python3 eval/report.py mine
```

A full run takes 2–3 hours on a 10-core laptop (long emails dominate); rerunning continues where it stopped. Stop a run with `docker kill eval-mine`: stopping only the terminal command leaves the container running, and two runs writing one file duplicate work.

## The held-out run with every layer on, the demo scenarios and adaptive attacks

These call paid APIs (`GEMINI_API_KEY`, `OPENROUTER_API_KEY` in `.env`), so they run on small sets only.

```sh
# Held-out run: all 300 held-out items, the judge-aimed attacks and the typed set (typed_attacks.py), LLM layers on.
python3 eval/build_heldout_llm.py
set -a; . ./.env; set +a
docker run --rm --name eval-heldout-llm --cpus 6 --memory 7g -e EVAL_LABEL=heldout-llm -e EVAL_INPUT=heldout_llm.jsonl \
  -e EVAL_LLM=1 -e EVAL_WORKERS=3 -e EVAL_COMMIT=$(git rev-parse HEAD) -e GEMINI_API_KEY -e OPENROUTER_API_KEY \
  -v "$PWD/eval:/eval" -v "$PWD/services/firewall/app:/app/app:ro" et-prompt-firewall-firewall:live python /eval/run.py
# The demo scenarios and the adaptive attacks need the stack running, with the firewall and the agent
# published on 127.0.0.1:8000 and 127.0.0.1:8001.
python3 eval/run_scenarios.py 3
OPENROUTER_API_KEY=... python3 eval/adaptive_attack.py
# Reports: eval/results/heldout-llm.md and the dashboard's web/src/data/dashboard.json
python3 eval/report_heldout.py
```

`typed_attacks.py` is our own writing: the per-type table reports it apart from the public sets, never blended in.
