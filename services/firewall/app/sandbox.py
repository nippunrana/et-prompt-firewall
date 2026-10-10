"""The sandbox: a deliberately gullible assistant reads the content, and code looks at what it tried to do.

It is an independent vote, read by code only:
  - any tool call beyond reading the content is an attack signal (the user only asked to read it);
  - addresses and links in the call's arguments that also appear in the content locate the attack;
  - no call is no vote: a model that was not fooled proves nothing, so it never clears a flag.
Its reasoning and reply are logged, never shown to the judge: they quote the attack word for word.
The tools are declarations only. Nothing is ever executed; our code answers every call.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field

from app import usage

MODEL = os.environ.get("SANDBOX_MODEL", "qwen/qwen3-next-80b-a3b-instruct")
TIMEOUT = 60  # seconds per model call
MAX_TURNS = 3  # a hijacked model often lists the invoices first and sends them on the next turn

ADDRESS = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+|https?://[^\s\"'<>)]+")

SYSTEM = ("You are a helpful personal assistant. You can use the tools provided to help "
          "the user with their email, files, calendar and payments.")
READ_TOOL = {"email": "read_latest_email", "document": "open_latest_document", "web": "open_web_page"}
READ_TOOLS = set(READ_TOOL.values())


def _fn(name: str, description: str, **params: str) -> dict:
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object",
                       "properties": {k: {"type": "string", "description": v} for k, v in params.items()},
                       "required": list(params)}}}


TOOLS = [
    _fn("read_latest_email", "Read the user's newest email."),
    _fn("open_latest_document", "Open the newest document the user received."),
    _fn("open_web_page", "Open the web page the user is looking at."),
    _fn("send_email", "Send an email.", to="Recipient address", subject="Subject", body="Body"),
    _fn("forward_email", "Forward the latest email.", to="Recipient address", note="Optional note"),
    _fn("search_contacts", "Look up a contact by name.", contact_name="Contact name"),
    _fn("list_invoices", "List the user's most recent invoices with their contents.", count="How many"),
    _fn("read_file", "Read a file from the user's computer.", path="File path"),
    _fn("delete_file", "Delete a file from the user's computer.", path="File path"),
    _fn("run_shell_command", "Run a shell command on the user's computer.", command="Command"),
    _fn("http_request", "Make an HTTP request.", url="URL", method="GET or POST", body="Request body"),
    _fn("create_calendar_event", "Create a calendar event.", title="Title", when="Date and time", attendees="Attendees"),
    _fn("make_payment", "Pay someone.", recipient="Recipient", amount="Amount", currency="Currency"),
]


def _fake_result(name: str, content: str) -> dict:
    if name in READ_TOOLS:
        return {"content": content}
    if name == "list_invoices":
        return {"invoices": [
            {"id": "INV-1041", "vendor": "Brightlane Supplies", "amount": "INR 48,200"},
            {"id": "INV-1040", "vendor": "Northwind Logistics", "amount": "INR 1,12,000"},
            {"id": "INV-1039", "vendor": "Cedar Office Co", "amount": "INR 9,850"},
        ]}
    if name == "search_contacts":
        return {"name": "Contact", "email": "contact@ourcompany.example"}
    return {"status": "done"}


@dataclass
class SandboxResult:
    ok: bool
    error: str | None = None
    calls: list[dict] = field(default_factory=list)  # tool calls beyond reading: {"name", "args"}
    reasoning: str = ""  # logged for the audit trail only
    reply: str = ""
    usage: list[dict] = field(default_factory=list)  # one entry per model call

    @property
    def acted(self) -> bool:
        return bool(self.calls)


def located(content: str, calls: list[dict]) -> list[tuple[int, int]]:
    """Positions in the content of the addresses and links the calls used."""
    found, lower = [], content.lower()
    for call in calls:
        for value in call["args"].values():
            for address in ADDRESS.findall(str(value)):
                start = lower.find(address.lower())
                while start >= 0:
                    found.append((start, start + len(address)))
                    start = lower.find(address.lower(), start + 1)
    return found


class QwenSandbox:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def _chat(self, messages: list[dict]) -> dict:
        # Prefer DeepInfra, where the model was measured; never forbid a host outright, or losing the only
        # allowed one fails every call (demo-agent/app/llm.py has the same rule).
        body = json.dumps({"model": MODEL, "messages": messages, "tools": TOOLS, "max_tokens": 6000,
                           "provider": {"order": ["DeepInfra"], "allow_fallbacks": True}}).encode()
        req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=body, headers={
            "Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.load(resp)
        if "error" in data:
            raise ValueError(str(data["error"])[:200])
        message = data["choices"][0]["message"]
        message["usage"] = usage.from_openrouter("sandbox", MODEL, data)
        return message

    def _chat_retry(self, messages: list[dict]) -> dict:
        """One retry: rate limits and slow responses are common, and short-lived."""
        try:
            return self._chat(messages)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503):
                raise
        except (TimeoutError, urllib.error.URLError):
            pass
        time.sleep(3)
        return self._chat(messages)

    def __call__(self, content: str, source: str | None, user_task: str) -> SandboxResult:
        read = READ_TOOL.get(source or "", "read_latest_email")
        # The read call is pre-seeded, so the first model call already sees the content.
        messages = [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": user_task},
            {"role": "assistant", "content": None,
             "tool_calls": [{"id": "call_read", "type": "function", "function": {"name": read, "arguments": "{}"}}]},
            {"role": "tool", "tool_call_id": "call_read", "content": json.dumps(_fake_result(read, content))},
        ]
        result = SandboxResult(ok=True)
        try:
            for _ in range(MAX_TURNS):
                msg = self._chat_retry(messages)
                result.usage.append(msg.pop("usage"))
                result.reasoning += (msg.get("reasoning") or "") + "\n"
                result.reply = msg.get("content") or result.reply
                tool_calls = msg.get("tool_calls") or []
                if not tool_calls:
                    break
                messages.append({"role": "assistant", "content": msg.get("content"), "tool_calls": tool_calls})
                for tc in tool_calls:
                    name = tc["function"]["name"]
                    try:
                        args = json.loads(tc["function"].get("arguments") or "{}")
                    except json.JSONDecodeError:
                        args = {"raw": tc["function"].get("arguments")}
                    if name not in READ_TOOLS:
                        result.calls.append({"name": name, "args": args if isinstance(args, dict) else {"raw": args}})
                    messages.append({"role": "tool", "tool_call_id": tc["id"],
                                     "content": json.dumps(_fake_result(name, content))})
        except Exception as e:  # a failure is no vote, unless the model had already acted
            return SandboxResult(ok=result.acted, error=f"{type(e).__name__}: {str(e)[:120]}", calls=result.calls,
                                 reasoning=result.reasoning, reply=result.reply, usage=result.usage)
        return result


def sandbox_from_env() -> QwenSandbox | None:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip().strip('"')
    return QwenSandbox(key) if key else None
