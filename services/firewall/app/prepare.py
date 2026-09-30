"""Step 1, prepare: turn incoming text into views the detectors can read, without losing the original.

Every view keeps, for each of its characters, the position it came from in the original text,
so whatever is flagged can be highlighted and cut in exactly the text the user sees.
"""

from __future__ import annotations

import base64
import binascii
import re
import unicodedata
from dataclasses import dataclass, field

MAX_DECODE_DEPTH = 2


@dataclass
class View:
    text: str
    origin: list[int]  # origin[i] is the index in the original text of text[i]

    def span(self, start: int, end: int) -> tuple[int, int]:
        """Maps [start, end) in this view to [start, end) in the original."""
        return self.origin[start], self.origin[end - 1] + 1


@dataclass
class Unit:
    """A sentence, a line, or an email's header block. The detectors score these, and in windows of three."""

    index: int
    start: int  # position in the original text
    end: int
    text: str  # normalised text


@dataclass
class Layer:
    """Text that was hidden inside the content in encoded form, decoded."""

    kind: str  # base64 | hex | unicode_tags | variation_selectors
    start: int  # position of the encoded run in the original text
    end: int
    text: str
    depth: int = 1


@dataclass
class Prepared:
    original: str
    view: View
    joined: View | None  # spaced-out letters joined up; read by the rules only
    units: list[Unit]
    layers: list[Layer]
    warnings: list[str] = field(default_factory=list)


# Look-alike letters, mapped to Latin only inside words that already mix in Latin letters,
# so genuine Cyrillic or Greek text is never altered.
_CONFUSABLES = str.maketrans({
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "і": "i", "ј": "j", "ѕ": "s",
    "ԁ": "d", "ӏ": "l", "һ": "h", "ԛ": "q", "ԝ": "w", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M",
    "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "І": "I", "Ј": "J", "Ѕ": "S",
    "α": "a", "ο": "o", "ρ": "p", "ν": "v", "ι": "i", "κ": "k", "τ": "t", "υ": "u", "Α": "A", "Β": "B",
    "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I", "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T",
    "Υ": "Y", "Χ": "X",
})
_CONFUSABLE_CHARS = {chr(c) for c in _CONFUSABLES}

_SPACED = re.compile(r"(?<!\w)\w(?: \w){2,}(?!\w)")
_BASE64 = re.compile(r"(?<![A-Za-z0-9+/=_-])[A-Za-z0-9+/_-]{16,}={0,2}(?![A-Za-z0-9+/=_-])")
_HEX = re.compile(r"(?<![0-9A-Fa-f])(?:[0-9A-Fa-f]{2}){8,}(?![0-9A-Fa-f])")
_HEADER_LINE = re.compile(r"[A-Za-z][A-Za-z-]{0,30}:[ \t]")
_SENTENCE_END = re.compile(r"[.!?]+[\"')\]]*(?=\s)")
# A full stop after these is not the end of a sentence: list numbers, initials, common abbreviations.
_NOT_AN_END = re.compile(r"(?:^|\s)(?:\d{1,3}|[A-Za-z]|e\.g|i\.e|etc|Mr|Mrs|Ms|Dr|vs|No)\.$")


def _is_tag(cp: int) -> bool:
    return 0xE0000 <= cp <= 0xE007F


def _is_variation_selector(cp: int) -> bool:
    return 0xFE00 <= cp <= 0xFE0F or 0xE0100 <= cp <= 0xE01EF


def _variation_selector_byte(cp: int) -> int:
    return cp - 0xFE00 if cp <= 0xFE0F else cp - 0xE0100 + 16


def _looks_like_text(s: str) -> bool:
    if len(s.strip()) < 4 or not any(c.isalpha() for c in s) or " " not in s.strip():
        return False
    printable = sum(c.isprintable() or c in "\n\t" for c in s)
    return printable / len(s) >= 0.9


def _normalise(original: str, layers: list[Layer], warnings: list[str]) -> View:
    chars: list[str] = []
    origin: list[int] = []
    invisible = 0
    i, n = 0, len(original)
    while i < n:
        cp = ord(original[i])
        if _is_tag(cp) or _is_variation_selector(cp):
            test = _is_tag if _is_tag(cp) else _is_variation_selector
            j = i
            while j < n and test(ord(original[j])):
                j += 1
            run = original[i:j]
            if test is _is_tag:
                decoded = "".join(chr(ord(c) - 0xE0000) for c in run if 0xE0020 <= ord(c) <= 0xE007E)
                kind = "unicode_tags"
            else:
                # One selector after an emoji is normal; a long run can carry hidden bytes.
                data = bytes(_variation_selector_byte(ord(c)) for c in run) if len(run) >= 4 else b""
                decoded = data.decode("utf-8", errors="ignore")
                kind = "variation_selectors"
            if _looks_like_text(decoded):
                layers.append(Layer(kind, i, j, decoded))
                warnings.append(f"hidden text in {kind.replace('_', ' ')}")
            i = j
            continue
        if unicodedata.category(original[i]) == "Cf":  # zero-width characters, direction overrides, soft hyphens
            invisible += 1
            i += 1
            continue
        for out in unicodedata.normalize("NFKC", original[i]):
            chars.append(out)
            origin.append(i)
        i += 1

    if invisible:
        warnings.append(f"{invisible} invisible character(s) removed")

    text = "".join(chars)
    mixed = 0
    for m in re.finditer(r"\w+", text):
        word = m.group()
        if any(c in _CONFUSABLE_CHARS for c in word) and any("a" <= c.lower() <= "z" for c in word):
            chars[m.start():m.end()] = list(word.translate(_CONFUSABLES))
            mixed += 1
    if mixed:
        warnings.append(f"{mixed} word(s) mixing look-alike letters from other alphabets")
    return View("".join(chars), origin)


def _join_spaced(view: View) -> View | None:
    if not _SPACED.search(view.text):
        return None
    chars: list[str] = []
    origin: list[int] = []
    last = 0
    for m in _SPACED.finditer(view.text):
        for k in range(last, m.end()):
            if k >= m.start() and view.text[k] == " ":
                continue
            chars.append(view.text[k])
            origin.append(view.origin[k])
        last = m.end()
    chars.extend(view.text[last:])
    origin.extend(view.origin[last:])
    return View("".join(chars), origin)


def _decode_candidate(token: str, kind: str) -> str | None:
    try:
        if kind == "hex":
            data = bytes.fromhex(token)
        else:
            padded = token + "=" * (-len(token) % 4)
            altchars = b"-_" if ("-" in token or "_" in token) else None
            data = base64.b64decode(padded, altchars=altchars, validate=True)
        decoded = data.decode("utf-8")
    except (binascii.Error, ValueError, UnicodeDecodeError):
        return None
    return decoded if _looks_like_text(decoded) else None


def _decode_layers(text: str, span_of, depth: int, layers: list[Layer]) -> None:
    for kind, pattern in (("base64", _BASE64), ("hex", _HEX)):
        for m in pattern.finditer(text):
            decoded = _decode_candidate(m.group(), kind)
            if decoded is None:
                continue
            start, end = span_of(m.start(), m.end())
            layers.append(Layer(kind, start, end, decoded, depth))
            if depth < MAX_DECODE_DEPTH:
                # A layer inside a layer cannot be mapped more precisely than its outer run.
                _decode_layers(decoded, lambda s, e, a=start, b=end: (a, b), depth + 1, layers)


def _units(view: View, email: bool) -> list[Unit]:
    text = view.text
    spans: list[tuple[int, int]] = []
    lines = list(re.finditer(r"[^\n]+", text))

    # An email's header block (From:, To:, Subject: …) is one unit: short header lines scored
    # on their own give the classifiers false alarms.
    first = 0
    if email:
        while first < len(lines) and _HEADER_LINE.match(lines[first].group().lstrip()):
            first += 1
        if first:
            spans.append((lines[0].start(), lines[first - 1].end()))

    for line in lines[first:]:
        start = line.start()
        for m in _SENTENCE_END.finditer(text, line.start(), line.end()):
            if _NOT_AN_END.search(text[start:m.end()]):
                continue
            spans.append((start, m.end()))
            start = m.end()
        spans.append((start, line.end()))

    units: list[Unit] = []
    for start, end in spans:
        piece = text[start:end]
        stripped = piece.strip()
        if not stripped:
            continue
        start += len(piece) - len(piece.lstrip())
        end = start + len(stripped)
        o_start, o_end = view.span(start, end)
        units.append(Unit(len(units), o_start, o_end, stripped))
    return units


def prepare(original: str, source: str | None = None) -> Prepared:
    layers: list[Layer] = []
    warnings: list[str] = []
    view = _normalise(original, layers, warnings)
    joined = _join_spaced(view)
    _decode_layers(view.text, view.span, 1, layers)
    if any(layer.kind in ("base64", "hex") for layer in layers):
        warnings.append("encoded text decoded")
    return Prepared(original, view, joined, _units(view, email=source == "email"), layers, warnings)
