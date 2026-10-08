# ET Prompt Firewall

A prompt injection firewall that sits in front of an AI agent. It checks everything the agent reads, finds hidden instructions, names the attack type and removes only the attack. It then checks every action the agent tries to take, so an attack that slips through still cannot make the agent send, forward or pay. No step waits for a person; an audit log records every decision.

Built for the ET AI Hackathon: Agentic Edition (Problem 2: Prompt Injection Firewall).

## Live demo

**https://egnitech.com/projects/et-prompt-firewall**

> The live version runs on a small shared VPS, in Docker with the firewall capped at **1.5 CPUs and 3 GB of RAM**, so it is slow there: a content check can take tens of seconds, and a protected agent run several minutes. For full speed, run it on your own machine (below).

The UI has four views:

- **Try it:** pick a ready-made scenario (invoices sent to an attacker, a stolen one-time code, an attack in romanized Hindi, a legitimate request that must still go through, and more) or start from a blank inbox. Every email's sender, subject and body can be edited, and you can add your own email or an example of each attack type. **Check this email** shows what the firewall removes from one email, why, and what the agent would receive. **Run both agents** sends the same inbox to an unprotected email assistant and to one protected by the firewall, side by side.
- **Results:** the measured results (below).
- **Audit log:** every decision both checkpoints made.
- **Any input:** pick the input type (email, user message, web page/HTML, PDF, Word, image, Markdown, API response, source code, OCR text), give it the content or a file, and see what the firewall removes, including text hidden from a person (HTML comments and hidden elements, white or tiny PDF text, hidden Word text). Example files are included.

## How it works

Two checkpoints ([full architecture](docs/architecture.md)):

1. **Content check (`POST /check`)**: rules, two local injection classifiers (PIGuard, Llama Prompt Guard 2) and a language gate score every sentence window. Anything they flag goes to an LLM judge (Gemma 4 31B), which names the attack and quotes it, and to a sandbox (a deliberately gullible model with fake tools: if the content makes it try to act, that is an attack). Code, never a model, makes the decision; the judge can never clear a strong signal. The attack is cut, the cleaned text is re-checked, and content that cannot be cleaned is withheld.
2. **Tool-call guard (`POST /guard`)**: plain code that never reads the content. It blocks an action when a secret is leaving, when a recipient or account did not come from the user, or when the user never asked for that kind of action.

It names nine attack types: instruction override, role change, secret extraction, tool abuse, credential theft, context poisoning, multi-step jailbreak, encoded instructions and indirect injection.

## Results

Measured on held-out data the firewall was never tuned on. Details, per-item IDs and method: [`eval/results/`](eval/results/README.md).

| Measure | Result |
| :--- | :--- |
| Public held-out attacks caught (LLMail-Inject, boundary pairs) | **104 / 120 (87%)** |
| Real email wrongly flagged (Enron, LLMail benign) | **0 / 140 (0%)** |
| Attacker's address still reaching the AI after cleaning (LLMail) | 21 / 90 (23%) |
| Injected PDFs caught (CrackedPDFs) → benign originals / look-alikes flagged | **50 / 50** → 0 / 50 · 11 / 50 |
| LLMail attacks hidden in HTML / Word files we generated → benign twins flagged | 26 / 30 · 25 / 30 → 0 / 60 |
| Attack emails that made the unprotected agent send data out → with the tool-call guard | **8 → 0** (of 33) |
| Legitimate send, forward and pay requests completed with full protection | 8 / 8 |

Per attack type (held-out; *ours* = sets we wrote for types public data barely covers, reported apart):

| Type | Caught | Type named |
| :--- | :--- | :--- |
| Instruction override | 9/9 | 9/9 |
| Role change | 15/18 | 4/18 |
| Secret extraction | 3/5 · ours 5/5 | 3/5 · ours 3/5 |
| Tool abuse | 78/90 | 73/90 |
| Credential theft | ours 6/6 | ours 3/6 |
| Context poisoning | 14/14 | 2/14 |
| Multi-step jailbreak | ours 6/6 | ours 1/6 |
| Encoded instructions | 7/7 · ours 5/5 | 5/7 · ours 2/5 |
| Indirect injection | 82/95 · ours 22/22 | 80/95 · ours 22/22 |

"Caught" means the attack was removed or the content withheld; the type is sometimes named differently (a fake approval is often named instruction override rather than context poisoning). Without the LLM layers, the local detectors alone wrongly flag 36% of real email (432 of 1,203; [v6.md](eval/results/v6.md)): the judge is what makes the firewall usable on ordinary mail. A check takes a median of 13.2 s on a laptop with the LLM layers on (a file, 23.6 s).

## Run it locally

You need Docker with Compose, about 4 GB of free memory and 10 GB of disk. The three services start with one command; the UI is then at **http://localhost:3020/projects/et-prompt-firewall**.

**1. Keys (optional).** Copy `.env.example` to `.env` and add:

- `GEMINI_API_KEY` (free from [Google AI Studio](https://aistudio.google.com/apikey)): the LLM judge.
- `OPENROUTER_API_KEY` ([openrouter.ai](https://openrouter.ai/keys)): the sandbox and the demo agent.

Without keys, the firewall runs its local detectors only (every answer says so) and the agent demo is off.

**2a. Run the prebuilt images (no build, recommended).**

```sh
git clone https://github.com/nippunrana/et-prompt-firewall.git && cd et-prompt-firewall
cp .env.example .env    # then add your keys
docker compose -f docker-compose.yml -f docker-compose.prebuilt.yml up -d
```

The first pull is about 3 GB. The images are built for x86_64; on Apple Silicon, Docker runs them under emulation, which works but is slower. For native speed on a Mac, build from source (2b).

**2b. Or build from source.** Prompt Guard 2 is a gated model, so the build needs a Hugging Face read token: accept the licence at [meta-llama/Llama-Prompt-Guard-2-86M](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M), create a [read token](https://huggingface.co/settings/tokens), and put it in `.env` as `HF_TOKEN`. Then:

```sh
docker compose up -d --build
```

The first build downloads about 4 GB (PyTorch and the models) and takes around 10–15 minutes.

**3. Check it is up:** `docker compose ps` shows all three services healthy (the firewall needs about 30 seconds to load its models).

The firewall's API is only on the internal Docker network. To call it directly (for example its `/docs` page), add a port to the `firewall` service, such as `ports: ["127.0.0.1:8000:8000"]`.

## Repository

| Path | What it is |
| :--- | :--- |
| `services/firewall/` | The firewall API: content check, tool-call guard, audit log, document extraction (FastAPI + LangGraph) |
| `services/demo-agent/` | The demo email assistant with fake tools (FastAPI + LangGraph) |
| `web/` | The demo UI (Next.js) |
| `eval/` | The evaluation harness, test-set builders and [results](eval/results/README.md) |
| `docs/architecture.md` | The architecture: process flow, decisions, model usage, attack coverage, limits |

Tests: `services/firewall/tests/` and `services/demo-agent/tests/` (pytest; CI runs both on every push).

## Limits

No prompt-injection defence is unbreakable; adaptive attacks beat every published one. What this one does not stop, and how we measured it, is in [docs/architecture.md](docs/architecture.md#11-known-limits) and [eval/results/adaptive.md](eval/results/adaptive.md).

## Credits

- **Built with Llama.** The firewall uses [Llama Prompt Guard 2 86M](https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M) by Meta, under the Llama 4 Community License.
- [PIGuard](https://huggingface.co/leolee99/PIGuard) (MIT), from *PIGuard: Prompt Injection Guardrail via Mitigating Overdefense for Free* (Li et al., ACL 2025).
- [GlotLID](https://huggingface.co/cis-lmu/glotlid) (Apache-2.0) for language identification.
- [Gemma 4](https://ai.google.dev/gemma) (Google) as the judge, via the Gemini API; [Qwen3-Next-80B](https://huggingface.co/Qwen) (Alibaba) as the sandbox and demo agent, via OpenRouter.
- OCR by [RapidOCR](https://github.com/RapidAI/RapidOCR) and [RapidTable](https://github.com/RapidAI/RapidTable).
- Evaluation data: [LLMail-Inject](https://huggingface.co/datasets/microsoft/llmail-inject-challenge) (Microsoft, MIT), [agentic prompt-injection boundary pairs](https://huggingface.co/datasets/3nesdeniz/agentic-prompt-injection-boundary-pairs) (CC-BY-4.0), and the Enron email corpus (aggregate numbers only; no text is published).
- Built with [LangGraph](https://github.com/langchain-ai/langgraph), [FastAPI](https://fastapi.tiangolo.com) and [Next.js](https://nextjs.org).
- UI animation by [GSAP](https://gsap.com) (free under GreenSock's [Standard "no charge" license](https://gsap.com/standard-license)); type set in [Geist and Geist Mono](https://vercel.com/font) (SIL Open Font License).
