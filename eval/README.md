# Evaluation harness

Measures the firewall on public data it was not trained on: attacks caught (recall), benign content flagged (false-positive rate), per attack type, and whether the cut lands on the attack.

| Set | Items | What it tests |
| :--- | :--- | :--- |
| `llmail_labelled` | 165 | Real adaptive attacks from [LLMail-Inject](https://huggingface.co/datasets/microsoft/llmail-inject-challenge) Phase 2 that hijacked an email assistant, labelled by attack type ([labels/](labels/)) |
| `llmail_teams` | 226 | More working Phase 2 attacks, at most 8 per team |
| `pairs_attack` / `pairs_benign` | 600 / 600 | [Boundary pairs](https://huggingface.co/datasets/3nesdeniz/agentic-prompt-injection-boundary-pairs): 12 attack families, each with a near-identical benign twin |
| `llmail_benign` | 203 | Microsoft's benign emails written for false-positive tests |
| `enron_benign` | 1,000 | Real work email (Enron corpus, random sample) |
| `planted` | 300 | Boundary-pair attacks inserted into other Enron emails at a recorded position (localisation) |

**Why these sets.** PIGuard was trained on BIPIA, deepset, HackAPrompt, InjecAgent and others, so those would flatter it; none of the sets above is in its training data. Prompt Guard 2's training data is not published; every set here was released after it.

**Limits.** The LLMail type labels were assigned by an AI labeller following [labels/labelling-guide.md](labels/labelling-guide.md) and checked by a second, blind AI labeller (29/30 exact agreement), not by humans. Many LLMail attacks share templates, so results are also reported per template family and per team. Enron text is real personal email: it is never committed or displayed, and only aggregate numbers are reported.

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
