"""Language Identification (LID) Gate for the prompt firewall.

Detects non-English and Romanized South Asian (Hinglish/Urdu/Tamil/etc.) injections
using quantized GlotLID v3, Method 8 (Careful short-line joining at 50% threshold),
Option B (wrapped continuation rejoining), and Option C (routing/header normalization).
"""

from __future__ import annotations

import logging
import os
import re
from dataclasses import dataclass, field

from app.prepare import Unit

log = logging.getLogger(__name__)

LID_MODEL_PATH = os.environ.get("LID_MODEL_PATH", "/tmp/lid/glotlid_q.ftz")
THRESHOLD = float(os.environ.get("LID_THRESHOLD", "0.50"))
MIN_WORDS = 6

_NOISE = re.compile(r"\S+@\S+|https?://\S+|www\.\S+|\S*\d\S*")
_WORD = re.compile(r"[^\W\d_]+(?:'[^\W\d_]+)?")

INDIC_MARKERS = {
    "hai", "hain", "hoon", "tha", "thi", "karo", "karna", "kar", "bhejo", "bhejna",
    "aur", "lekin", "magar", "warna", "mein", "saath", "liye", "bina", "yeh", "woh",
    "isko", "usko", "unka", "aap", "tum", "mera", "meri", "mere", "mujhe", "tera",
    "teri", "tere", "bhi", "toh", "sirf", "nahi", "nahin", "pehle", "pichle", "turant",
    "jaldi", "saare", "pure", "puri", "pura", "bohot", "bahut", "kuch", "mat",
}

_FORWARDED = re.compile(r"^-+\s*(?:Forwarded by|Original Message).*", re.IGNORECASE)
_MIME = re.compile(r"^(?:--[A-Za-z0-9=_-]+|Content-Type:|Content-Transfer-Encoding:|boundary=)", re.IGNORECASE)
_SYS_LINE = re.compile(r"^[A-Z0-9_-]+:\s*[A-Z0-9_./-]+$", re.IGNORECASE)
_QUOTE = re.compile(r"^>+\s*")
_HEADER_PREFIX = re.compile(r"^(?:To|From|Cc|Bcc|Date|Sent|Subject|Received|X-[A-Za-z0-9_-]+):\s*", re.IGNORECASE)
_ROUTING_TOKEN = re.compile(r"\b[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:@[A-Za-z0-9_.-]+)?\b")
_TIMESTAMP = re.compile(r"\b\d{1,2}/\d{1,2}/\d{2,4}\b|\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?\b|\b(?:PST|PDT|EST|EDT|CST|CDT|GMT|UTC)\b", re.IGNORECASE)
_EMAIL_ADDR = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b")


def clean(text: str) -> str:
    return " ".join(_NOISE.sub(" ", text).split())


def words(text: str) -> list[str]:
    return _WORD.findall(clean(text))


def has_indic_markers(text: str) -> bool:
    return any(w.lower() in INDIC_MARKERS for w in words(text))


def is_name_token(token: str) -> bool:
    clean_tok = re.sub(r"[()]", "", token).strip()
    tok_words = words(clean_tok)
    return 1 <= len(tok_words) <= 3 and all(w[0].isupper() or len(w) <= 2 for w in clean_tok.split() if w.isalpha())


def normalize_line_option_c(line: str) -> tuple[str, bool]:
    stripped = line.strip()
    if not stripped or not words(stripped) or re.match(r"^[-=_*~#]{3,}$", stripped):
        return "", True

    if _FORWARDED.match(stripped) or _MIME.match(stripped) or _SYS_LINE.match(stripped):
        return "", True

    if _QUOTE.match(stripped):
        stripped = _QUOTE.sub("", stripped).strip()

    if _HEADER_PREFIX.match(stripped):
        header_val = _HEADER_PREFIX.sub("", stripped).strip()
        header_val = _ROUTING_TOKEN.sub(" ", header_val)
        header_val = _EMAIL_ADDR.sub(" ", header_val)
        header_val = _TIMESTAMP.sub(" ", header_val)

        chunks = [c.strip() for c in re.split(r"[;,]", header_val) if c.strip()]
        if chunks and all(is_name_token(c) for c in chunks):
            return "", True

        if len(words(header_val)) == 0:
            return "", True
        return header_val.strip(), False

    return stripped, False


def normalize_unit_option_c(text: str) -> tuple[str, bool]:
    lines = text.split("\n")
    cleaned_lines = []
    has_payload = False
    for line in lines:
        cleaned, is_meta = normalize_line_option_c(line)
        if not is_meta and cleaned:
            cleaned_lines.append(cleaned)
            has_payload = True
    if not has_payload:
        return "", True
    return " ".join(cleaned_lines), False


@dataclass
class LIDFlag:
    unit_index: int
    start: int
    end: int
    text: str
    p_eng: float
    top_language: str
    by: str


@dataclass
class LIDResult:
    has_non_english: bool
    flags: list[LIDFlag] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


class LIDGate:
    def __init__(self, model_path: str = LID_MODEL_PATH):
        self.model = None
        self.available = False
        try:
            import fasttext
            fasttext.FastText.eprint = lambda *a, **k: None
            if hasattr(fasttext.FastText, "np"):
                _ft_np = fasttext.FastText.np
                _orig_arr = _ft_np.array

                def _safe_arr(a, *args, **kwargs):
                    if kwargs.get("copy") is False:
                        kwargs.pop("copy")
                        return _ft_np.asarray(a, *args, **kwargs)
                    return _orig_arr(a, *args, **kwargs)

                _ft_np.array = _safe_arr
            if os.path.exists(model_path):
                self.model = fasttext.load_model(model_path)
                self.available = True
                log.info("LIDGate: Loaded GlotLID model from %s", model_path)
            else:
                log.warning("LIDGate: Model file not found at %s", model_path)
        except Exception as e:
            log.warning("LIDGate: Failed to initialize fasttext: %s", e)

    def score(self, text: str) -> dict:
        if not self.available or not self.model:
            return {"p_eng": 1.0, "top": "eng_Latn", "top_p": 1.0}
        c = clean(text).lower()
        if not c or not words(c):
            return {"p_eng": 1.0, "top": "eng_Latn", "top_p": 1.0}
        labels, probs = self.model.predict(c, k=5)
        p = dict(zip(labels, map(float, probs)))
        top = labels[0].replace("__label__", "") if labels else ""
        return {
            "p_eng": round(p.get("__label__eng_Latn", 0.0), 4),
            "top": top,
            "top_p": round(float(probs[0]), 4) if len(probs) else 0.0,
        }

    def check(self, units: list[Unit], content: str, source: str | None = None, threshold: float = THRESHOLD) -> LIDResult:
        if not self.available:
            return LIDResult(has_non_english=False)

        n_units = len(units)
        if n_units == 0:
            return LIDResult(has_non_english=False)

        is_email = source == "email"

        # 1. Option C Normalization
        unit_payloads: list[str] = []
        pure_metadata: set[int] = set()
        for i, u in enumerate(units):
            if is_email:
                norm_text, is_meta = normalize_unit_option_c(u.text)
                if is_meta:
                    pure_metadata.add(i)
                unit_payloads.append(norm_text)
            else:
                unit_payloads.append(u.text)

        # 2. Option B Wrapped sentence rejoining (for emails)
        cleared_by_wrap: set[int] = set()
        if is_email:
            i = 0
            while i < n_units:
                if i in pure_metadata or not unit_payloads[i].strip():
                    i += 1
                    continue

                curr_units = [i]
                curr_texts = [unit_payloads[i]]

                while curr_units[-1] + 1 < n_units:
                    nxt = curr_units[-1] + 1
                    if nxt in pure_metadata or not unit_payloads[nxt].strip():
                        break

                    prev_text = unit_payloads[curr_units[-1]].strip()
                    nxt_text = unit_payloads[nxt].strip()

                    ends_term = bool(re.search(r'[.!?]["\')\]]*$', prev_text)) or prev_text.endswith(":")
                    nxt_starts_new = (
                        bool(_HEADER_PREFIX.match(nxt_text))
                        or bool(_QUOTE.match(nxt_text))
                        or bool(re.match(r"^[-*]\s|\d+[\.\)]\s", nxt_text))
                    )
                    has_double_newline = "\n\n" in content[units[curr_units[-1]].end:units[nxt].start]

                    if not ends_term and not nxt_starts_new and not has_double_newline:
                        curr_units.append(nxt)
                        curr_texts.append(nxt_text)
                    else:
                        break

                if len(curr_units) > 1:
                    combined_text = " ".join(curr_texts)
                    if len(words(combined_text)) >= MIN_WORDS:
                        sc = self.score(combined_text)
                        if sc["p_eng"] >= threshold:
                            for u_idx in curr_units:
                                u_t = unit_payloads[u_idx]
                                if not has_indic_markers(u_t):
                                    u_sc = self.score(u_t)
                                    if u_sc["top"] == "eng_Latn" or u_sc["p_eng"] >= 0.20:
                                        cleared_by_wrap.add(u_idx)
                i = curr_units[-1] + 1

        # 3. Method 8 scoring
        flagged_map: dict[int, dict] = {}

        # Lines >= MIN_WORDS
        for i, u in enumerate(units):
            if i in pure_metadata or i in cleared_by_wrap:
                continue
            txt = unit_payloads[i]
            if len(words(txt)) >= MIN_WORDS:
                sc = self.score(txt)
                if sc["p_eng"] < threshold:
                    flagged_map[i] = {"by": "line", "p_eng": sc["p_eng"], "top": sc["top"]}

        # Short runs < MIN_WORDS
        short_runs: list[list[int]] = []
        cur_run: list[int] = []
        for i, u in enumerate(units):
            if i in pure_metadata or i in cleared_by_wrap:
                if cur_run:
                    short_runs.append(cur_run)
                    cur_run = []
                continue
            txt = unit_payloads[i]
            if 0 < len(words(txt)) < MIN_WORDS:
                cur_run.append(i)
            else:
                if cur_run:
                    short_runs.append(cur_run)
                    cur_run = []
        if cur_run:
            short_runs.append(cur_run)

        for run in short_runs:
            buf: list[int] = []
            for k in run:
                sc_unit = self.score(unit_payloads[k])
                if sc_unit["p_eng"] >= threshold and sc_unit["top"] == "eng_Latn":
                    continue
                buf.append(k)
                buf_text = " ".join(unit_payloads[j] for j in buf)
                if len(words(buf_text)) >= MIN_WORDS:
                    sc_buf = self.score(buf_text)
                    if sc_buf["p_eng"] < threshold:
                        for j in buf:
                            flagged_map[j] = {"by": "joined short lines", "p_eng": sc_buf["p_eng"], "top": sc_buf["top"]}
                    buf = []
            if buf:
                buf_text = " ".join(unit_payloads[j] for j in buf)
                if len(words(buf_text)) >= MIN_WORDS:
                    sc_buf = self.score(buf_text)
                    if sc_buf["p_eng"] < threshold:
                        for j in buf:
                            flagged_map[j] = {"by": "joined short lines", "p_eng": sc_buf["p_eng"], "top": sc_buf["top"]}

        flags = [
            LIDFlag(
                unit_index=k,
                start=units[k].start,
                end=units[k].end,
                text=units[k].text,
                p_eng=flagged_map[k]["p_eng"],
                top_language=flagged_map[k]["top"],
                by=flagged_map[k]["by"],
            )
            for k in sorted(flagged_map)
        ]

        warnings: list[str] = []
        if flags:
            top_langs = sorted({f.top_language for f in flags})
            warnings.append(f"non-English content detected ({', '.join(top_langs)})")

        return LIDResult(has_non_english=len(flags) > 0, flags=flags, warnings=warnings)


_GATE_INSTANCE: LIDGate | None = None


def get_lid_gate() -> LIDGate:
    global _GATE_INSTANCE
    if _GATE_INSTANCE is None:
        _GATE_INSTANCE = LIDGate()
    return _GATE_INSTANCE
