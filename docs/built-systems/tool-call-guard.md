# Tool-call guard (`POST /guard`) and the demo agent (`POST /run`)

Checkpoint 2: the guard checks what an agent is about to *do*, after the content checks of `/check`. Code: `services/firewall/app/guard.py` (the guard), `services/demo-agent/app/` (the agent that calls it).

## Rules

- **The guard never reads content and never calls a model.** It is the layer an attacker cannot talk to: an email can fool the classifiers and the judge, but not a provenance check. Never add an LLM or a content scan to it. `untrusted` in the request is used only to say *where* a bad value came from; a value the user did not give is blocked whether or not it appears there.
- **It blocks an outgoing action (send, forward, pay, delete, run, fetch) when:** a password, key, one-time code or the agent's canary is in the arguments; a recipient, link or account is not in the user's request or contacts; or the user's request does not ask for that kind of action.
- **Intent words are verbs only.** "Check my email" is not a request to send, and "summarise the payment reminders" is not a request to pay. The intent check is keyword-based, so a request phrased without one of the verbs is blocked; that is the intended failure direction.
- **No human in the loop.** Every block, and every allowed action a human would have been asked about (any payment, delete or run, and any recipient outside the contacts), is appended to the review log (`GUARD_REVIEW_LOG`, default `/data/guard-review.jsonl` on the `guard-review` volume) so rules can be set later. Never pause for approval.
- **A forwarded email's full text goes to the guard's secrets check** (as `forwarded_email` in the arguments). A forward carries the whole email out, so a one-time code inside it is leaving even though the tool's own arguments are only an id and an address.
- **Both checkpoints fail closed in the agent.** If `/check` cannot be reached the email is withheld; if `/guard` cannot be reached the action is blocked.
- **A blocked agent is told why and carries on** with the user's request; it is never stopped outright.
- **The demo agent's tools are fake.** Nothing is sent or paid; effects are only reported. Never wire a real mailbox or payment API to it.
- **The agent's model (`qwen/qwen3-next-80b-a3b-thinking`) is chosen because it is easy to fool.** The unprotected run must show the attack; a model that refuses injections (newer Gemini models refused 7–9 of 9 on 2026-09-30) would make the demo show nothing. Never swap it for a "safer" model without re-running the unprotected demo.
- **Never let OpenRouter route this model to Google** (`provider.ignore` in `services/demo-agent/app/llm.py` and the firewall's `app/sandbox.py`). Google's endpoint often writes tool calls as plain text (6 of 8 calls, 2026-10-09; Alibaba's: 8 of 8 correct). The agent then never reads the inbox, so every attack looks like it failed, and the sandbox reads it as "no action taken".
- **What the guard cannot stop** (state these in the submission): data sent to a recipient the user really did name, when the user really asked to send; anything the agent *says* to the user (a false summary or a phishing link in the answer is a content problem, for `/check`); and requests worded without one of the intent verbs, which are blocked rather than allowed.
- **Measured 2026-10-07** (`eval/results/agent-phase4.md`): of 33 attack emails, 8 made the unprotected agent send data out; with the guard, 0 of 33 runs sent anything (7 blocks, plus 1 run where the agent did not try). All 8 legitimate send, forward and pay tasks went through.
