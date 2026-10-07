"""The agent's model: Qwen3-next-80B thinking on OpenRouter.

Chosen because it is easy to fool: the unprotected run must show the attack working, and in our
tests this model followed injected email instructions where newer Gemini models refused.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request

MODEL = os.environ.get("AGENT_MODEL", "qwen/qwen3-next-80b-a3b-thinking")
TIMEOUT = 90  # seconds per call


class OpenRouterChat:
    def __init__(self, api_key: str):
        self.api_key = api_key

    def _post(self, body: bytes) -> dict:
        req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=body, headers={
            "Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            data = json.load(resp)
        if "error" in data:
            raise RuntimeError(str(data["error"])[:200])
        return data["choices"][0]["message"]

    def __call__(self, messages: list[dict], tools: list[dict]) -> dict:
        """One model turn: {"content", "reasoning", "tool_calls"}. One retry on a rate limit or timeout."""
        body = json.dumps({"model": MODEL, "messages": messages, "tools": tools,
                           "reasoning": {"enabled": True}, "max_tokens": 6000}).encode()
        try:
            return self._post(body)
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503):
                raise
        except (TimeoutError, urllib.error.URLError):
            pass
        time.sleep(3)
        return self._post(body)


def chat_from_env() -> OpenRouterChat | None:
    key = os.environ.get("OPENROUTER_API_KEY", "").strip().strip('"')
    return OpenRouterChat(key) if key else None
