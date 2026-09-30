"""Step 2a, rules: known attack phrasing, matched precisely and explainably.

A strong rule is evidence of an attack on its own. A weak rule is only a hint: it names a likely
type and joins a cut next to real evidence, but never triggers a cut by itself, because the same
wording is common in ordinary email ("please send the report to anita@…").
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.prepare import Prepared, View

STRONG, WEAK = "strong", "weak"
_F = re.IGNORECASE | re.MULTILINE


@dataclass(frozen=True)
class Rule:
    id: str
    type: str
    strength: str
    pattern: re.Pattern
    outside_only: bool = False  # only counts when the content did not come from the user


@dataclass(frozen=True)
class Hit:
    rule: str
    type: str
    strength: str
    start: int  # position in the original text
    end: int
    text: str
    layer: str | None = None  # set when the match was inside decoded text


_INSTRUCTIONS = r"(?:instructions?|rules|guidelines|prompts?|directions|directives|guardrails|constraints|policies|programming)"
_EMAIL = r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"
_CREDENTIAL = (r"(?:passwords?|passcodes?|api[\s_-]?keys?|access[\s_-]tokens?|secret[\s_-]keys?|credentials|"
               r"OTPs?|one[\s-]time[\s-](?:codes?|passwords?)|2FA[\s-]codes?|verification[\s-]codes?|"
               r"login[\s-]details|private[\s-]keys?|session[\s-]cookies?)")

RULES = [
    Rule("R-OVR-1", "instruction_override", STRONG, re.compile(
        r"\b(?:ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}?\b(?:previous|prior|above|earlier|preceding|"
        r"all|any|your|system|original|initial)\b[^.\n]{0,30}?\b" + _INSTRUCTIONS + r"\b", _F)),
    Rule("R-OVR-2", "instruction_override", STRONG, re.compile(
        r"\byour\s+(?:new|real|actual|true|updated)\s+(?:instructions?|task|objective|goal|orders)\b", _F)),
    Rule("R-OVR-3", "instruction_override", STRONG, re.compile(
        r"\b(?:do\s+not|don['’]?t|never|without)\s+(?:tell|mention|inform|notify|alert|reveal)\w*\s+(?:this\s+|it\s+)?"
        r"(?:to\s+)?the\s+user\b", _F)),
    Rule("R-OVR-4", "instruction_override", STRONG, re.compile(
        r"\b(?:do\s+not|don['’]?t|never|without)\s+(?:mention|include|reference|disclos)\w*\s+(?:it|this|that)\s+in\s+"
        r"(?:your|the)\s+(?:reply|response|summary|answer|output)\b", _F)),
    Rule("R-BND-1", "instruction_override", STRONG, re.compile(
        r"</?(?:system|assistant|instructions?)>|\[/?(?:SYSTEM|INST)\]|<\|(?:im_start|im_end|system|endoftext|"
        r"eot_id|start_header_id)\|>|^\s*#{2,}\s*(?:system|new\s+instructions?)\b|"
        r"\bBEGIN\s+(?:SYSTEM|ADMIN)\s+(?:PROMPT|INSTRUCTIONS?|MESSAGE)\b", _F)),
    Rule("R-ROLE-1", "role_change", STRONG, re.compile(
        r"\byou\s+are\s+now\s+(?:an?\s+|in\s+)?(?:\w+\s+){0,2}?(?:AI|assistant|model|chatbot|persona|mode|character)\b|"
        r"\byou\s+are\s+no\s+longer\s+(?:an?\s+)?(?:AI|assistant|bound|restricted|limited)\b|"
        r"\b(?:developer|god|admin|debug|DAN|jailbreak|unrestricted)\s+mode\b|"
        r"\bfrom\s+now\s+on,?\s+you\s+(?:are|will\s+act|must\s+act)\s+as\b", _F)),
    Rule("R-SEC-1", "secret_extraction", STRONG, re.compile(
        r"\b(?:reveal|repeat|print|show|output|display|leak|disclose|tell\s+me)\b[^.\n]{0,30}?\b(?:your|the)\s+"
        r"(?:system\s+prompt|initial\s+(?:instructions|prompt)|hidden\s+(?:instructions|prompt)|"
        r"original\s+instructions|developer\s+(?:message|instructions)|instructions\s+above)\b", _F)),
    Rule("R-CRD-1", "credential_theft", STRONG, re.compile(
        r"\b(?:send|give|share|forward|email|post|reply\s+with)\b[^.\n]{0,40}?\b" + _CREDENTIAL +
        r"\b[^.\n]{0,40}?\bto\s+(?:" + _EMAIL + r"|https?://\S+)", _F)),
    Rule("R-AI-1", "indirect_injection", STRONG, re.compile(
        r"(?:^|(?<=[.!?]\s))\s*(?:AI|LLM)\s+(?:assistant|agent|model)s?\s*:|"
        r"\b(?:note|message|instructions?)\s+(?:to|for)\s+(?:the\s+|any\s+)?(?:AI|LLM|language\s+model|assistant)s?\b|"
        r"\b(?:AI|LLM|assistants?|language\s+models?|chatbots?)\s+(?:reading|processing|handling|summari[sz]ing|reviewing)"
        r"\s+this\s+(?:thread|email|message|document|page|file)\b|"
        r"\bwhoever\s+(?:reads|processes|summari[sz]es)\s+this\s+on\s+behalf\s+of\b", _F), outside_only=True),
    Rule("R-ACT-1", "tool_abuse", WEAK, re.compile(
        r"\b(?:forward|send|email|transfer|wire|pay|upload|share|post|copy|export)\b[^.\n]{0,80}?\bto\s+" + _EMAIL, _F)),
    Rule("R-ACT-2", "tool_abuse", WEAK, re.compile(
        r"\b(?:forward|send|export|delete|remove|wipe|erase)\s+(?:all|every|each|the\s+entire)\b|"
        r"\brun\s+(?:this|the\s+following)\s+(?:command|code|script)\b", _F)),
    Rule("R-CRD-2", "credential_theft", WEAK, re.compile(
        r"\b(?:send|give|share|provide|forward|email|post|paste|enter|type|reply\s+with|tell\s+me)\b[^.\n]{0,40}?\b"
        + _CREDENTIAL + r"\b", _F)),
    Rule("R-SEC-2", "secret_extraction", WEAK, re.compile(r"\bsystem\s+prompt\b", _F)),
    Rule("R-ROLE-2", "role_change", WEAK, re.compile(r"\bpretend\s+(?:to\s+be|you\s+are)\b|\bact\s+as\s+(?:an?\s+)?\w+", _F)),
]

_NEGATED = re.compile(r"\b(?:never|don['’]?t|do\s+not|not)\b[^.\n]{0,15}$", re.IGNORECASE)


def _scan(view_text: str, span_of, source: str | None, layer: str | None) -> list[Hit]:
    hits = []
    for rule in RULES:
        if rule.outside_only and source == "user":
            continue
        for m in rule.pattern.finditer(view_text):
            found = m.group()
            if not found.strip():
                continue
            # Trim surrounding whitespace, so a hit never touches the sentence next to it.
            m_start = m.start() + len(found) - len(found.lstrip())
            m_end = m.end() - (len(found) - len(found.rstrip()))
            # "Never share your password" is advice, not a request for it.
            if rule.type == "credential_theft" and _NEGATED.search(view_text[max(0, m_start - 20):m_start]):
                continue
            start, end = span_of(m_start, m_end)
            hits.append(Hit(rule.id, rule.type, rule.strength, start, end, found.strip(), layer))
    return hits


def match(prepared: Prepared, source: str | None) -> list[Hit]:
    """All rule hits, on the normalised text, the joined-letters view and every decoded layer."""
    hits = _scan(prepared.view.text, prepared.view.span, source, None)
    if prepared.joined is not None:
        joined: View = prepared.joined
        seen = {(h.rule, h.start) for h in hits}
        hits += [h for h in _scan(joined.text, joined.span, source, None) if (h.rule, h.start) not in seen]
    for layer in prepared.layers:
        hits += _scan(layer.text, lambda s, e, a=layer.start, b=layer.end: (a, b), source, layer.kind)
    return hits
