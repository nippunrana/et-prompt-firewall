"""The tool-call guard: checkpoint 2. It checks what the agent is about to do, never the content it read.

Plain code, no model, so nothing in an email can talk it out of a decision. For an action that leaves
the user's machine (send, pay, delete, run, fetch), it blocks when:
  1. a secret is going out: a password, key or one-time code, or the agent's own canary word;
  2. a recipient, link or account does not come from the user: it is not in the user's request or
     contacts (if it appears in content the agent read, the attack came from there);
  3. the user did not ask for that kind of action ("summarise my emails" never needs a payment).
There is no human in the loop: every block, and every allowed action a human would have been asked
about, is appended to a review log so rules can be set later.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from dataclasses import asdict, dataclass, field

log = logging.getLogger(__name__)
REVIEW_LOG = os.environ.get("GUARD_REVIEW_LOG", "/data/guard-review.jsonl")

# Tools with an effect outside the agent, by kind; any other tool only reads.
ACTION_KIND = {"send_email": "send", "forward_email": "send", "reply_email": "send", "make_payment": "pay",
               "delete_email": "delete", "delete_file": "delete", "run_shell_command": "run", "http_request": "fetch"}
# Verbs in the user's request that ask for each kind of action. Verbs only: "check my email" or
# "summarise the payment reminders" must not count as asking to send or to pay.
INTENT = {
    # "email" counts only as a verb: at the start, or after please/and/then/also/you/to ("Email HR to say …",
    # "can you email Anita"), never as a noun ("check my email").
    "send": r"\b(send|forward|reply|share|cc)\b|(?:^|\b(?:please|and|then|also|you|to)\s+)e-?mail\b",
    "pay": r"\b(pay|transfer|remit|settle)\b",
    "delete": r"\b(delete|remove|trash)\b",
    "run": r"\b(run|execute|install)\b",
    "fetch": r"\b(open|fetch|visit|download|browse|check the (?:link|site|page))\b",
}
RISKY = {"pay", "delete", "run"}  # a human would have been asked even when allowed
TARGET_ARGS = {"to", "cc", "bcc", "recipient", "url", "account", "iban", "address"}

ADDRESS = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?://[^\s\"'<>)]+")
SECRETS = [
    (re.compile(r"(?i)\b(?:password|passwd|pwd|passcode)\b\s*[:=]?\s*\S{4,}"), "a password"),
    (re.compile(r"(?i)\b(?:otp|one[- ]time (?:code|password)|verification code|security code)\b\D{0,20}\d{4,8}"), "a one-time code"),
    (re.compile(r"\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_-]{30,}|\bgh[po]_[A-Za-z0-9]{30,}"), "an API key"),
]


@dataclass
class Check:
    name: str
    passed: bool
    detail: str = ""


@dataclass
class GuardDecision:
    decision: str  # allow | block
    reason: str = ""
    types: list[str] = field(default_factory=list)
    checks: list[Check] = field(default_factory=list)
    needs_review: bool = False


def _targets(args: dict) -> list[str]:
    values = []
    for key, value in args.items():
        if key.lower() in TARGET_ARGS and value:
            for item in value if isinstance(value, list) else [value]:
                found = ADDRESS.findall(str(item))
                values += found or [str(item).strip()]
    return values


def _origin(value: str, user_text: str, untrusted: list[str]) -> str:
    v = value.lower()
    if v in user_text:
        return "user"
    if any(v in t.lower() for t in untrusted):
        return "outside content"
    return "nowhere the user gave it"


def check_action(tool: str, args: dict, user_request: str, contacts: list[str],
                 untrusted: list[str], canaries: list[str]) -> GuardDecision:
    kind = ACTION_KIND.get(tool)
    if kind is None:
        return GuardDecision("allow", "reads only", checks=[Check("action", True, "no effect outside the agent")])

    checks, types, reasons = [], [], []
    values = " ".join(str(v) for v in args.values())
    secret_reasons = []
    if any(c and c in values for c in canaries):
        types.append("secret_extraction")
        secret_reasons.append("the agent's own confidential instructions are in the outgoing data")
    found = [what for pattern, what in SECRETS if pattern.search(values)]
    if found:
        types.append("credential_theft")
        secret_reasons.append(f"{' and '.join(found)} would leave in the outgoing data")
    reasons += secret_reasons
    checks.append(Check("secrets", not secret_reasons, "; ".join(secret_reasons) or "none found"))

    user_text = (user_request + "\n" + "\n".join(contacts)).lower()
    bad = [(t, _origin(t, user_text, untrusted)) for t in _targets(args)]
    bad = [(t, o) for t, o in bad if o != "user"]
    if bad:
        types.append("tool_abuse")
        reasons += [f"{t} came from {o}, not from the user" for t, o in bad]
    checks.append(Check("provenance", not bad, "; ".join(f"{t}: {o}" for t, o in bad) or "every target came from the user"))

    asked = re.search(INTENT[kind], user_request, re.I) is not None
    if not asked:
        types.append("tool_abuse")
        reasons.append(f"the user did not ask to {kind}")
    checks.append(Check("intent", asked, f"the request {'asks' if asked else 'does not ask'} to {kind}"))

    if reasons:
        return GuardDecision("block", "; ".join(reasons), list(dict.fromkeys(types)), checks, needs_review=True)
    new_recipient = any(t.lower() not in "\n".join(contacts).lower() for t in _targets(args))
    return GuardDecision("allow", "every check passed", [], checks, needs_review=kind in RISKY or new_recipient)


def record(decision: GuardDecision, tool: str, args: dict, user_request: str) -> None:
    """Append a decision that a human would have reviewed. Never fails the request."""
    if not decision.needs_review:
        return
    entry = {"time": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "tool": tool, "args": args,
             "user_request": user_request, **asdict(decision)}
    try:
        with open(REVIEW_LOG, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        log.exception("could not write the guard review log")
