"""Tokens and cost of each LLM call. Token counts always come from the provider.

- OpenRouter returns the amount it charged in `usage.cost` (US dollars) on every response.
- The Gemini API returns exact token counts in `usageMetadata` but no cost: Google offers Gemma 4 free
  of charge there. Its cost is estimated as the provider's token counts times OpenRouter's list price
  for the same model, and marked "estimated". The same sum reproduces OpenRouter's reported charge
  for Qwen to the last digit.
"""

from __future__ import annotations

# OpenRouter's list price for google/gemma-4-31b-it, US dollars per token (input, output), checked 2026-10-08.
GEMMA_PRICE = (0.09e-6, 0.34e-6)


def from_openrouter(role: str, model: str, data: dict) -> dict:
    u = data.get("usage") or {}
    return {"role": role, "model": data.get("model") or model, "via": "OpenRouter", "provider": data.get("provider"),
            "calls": 1, "input_tokens": u.get("prompt_tokens", 0), "output_tokens": u.get("completion_tokens", 0),
            "reasoning_tokens": (u.get("completion_tokens_details") or {}).get("reasoning_tokens", 0),
            "cost_usd": u.get("cost"), "pricing": "reported"}


def from_gemini(role: str, model: str, data: dict) -> dict:
    u = data.get("usageMetadata") or {}
    thoughts = u.get("thoughtsTokenCount", 0)
    tokens_in = u.get("promptTokenCount", 0)
    tokens_out = u.get("candidatesTokenCount", 0) + thoughts  # thinking is billed as output
    return {"role": role, "model": data.get("modelVersion") or model, "via": "Gemini API", "provider": "Google",
            "calls": 1, "input_tokens": tokens_in, "output_tokens": tokens_out, "reasoning_tokens": thoughts,
            "cost_usd": tokens_in * GEMMA_PRICE[0] + tokens_out * GEMMA_PRICE[1], "pricing": "estimated"}


def merge(entries: list[dict]) -> list[dict]:
    """One entry per role and model: calls, tokens and cost added up."""
    merged: dict[tuple[str, str], dict] = {}
    for e in entries:
        key = (e["role"], e["model"])
        if key not in merged:
            merged[key] = dict(e)
            continue
        m = merged[key]
        for field in ("calls", "input_tokens", "output_tokens", "reasoning_tokens"):
            m[field] += e[field]
        m["cost_usd"] = None if m["cost_usd"] is None or e["cost_usd"] is None else m["cost_usd"] + e["cost_usd"]
    return list(merged.values())
