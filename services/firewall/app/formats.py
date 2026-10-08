"""Step 0, formats: split structured content into what a person sees and what only a machine reads.

Never strip and forget: most web injections sit in HTML a browser never shows (comments, hidden
elements, metadata), and document attacks hide in white, tiny or hidden-flagged text. So the
visible text becomes the view the classifiers read as prose, and every hidden part becomes a
layer that every detector also reads. Both keep positions in the original, so a cut removes
exactly the hidden element, comment or attribute value.

Text that a stylesheet hides by class needs a real browser render, and <script>/<style> are
code, not read: both are stated limits.
"""

from __future__ import annotations

import html
import re
import unicodedata
from html.parser import HTMLParser

from app.prepare import Layer, View

# Kinds of hidden layer. Decoded layers (base64, unicode_tags …) are a different thing: encoded text.
HTML_COMMENT, HTML_HIDDEN, HTML_ATTRIBUTE = "html_comment", "html_hidden", "html_attribute"

_VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
_BLOCK = {"address", "article", "aside", "blockquote", "br", "dd", "div", "dl", "dt", "figcaption", "figure",
          "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p",
          "pre", "section", "table", "td", "th", "title", "tr", "ul"}
_SKIPPED = {"script", "style"}  # code: not read (a stated limit)
_HIDDEN_TAGS = {"noscript", "template"}  # never shown in a normal page view, but read by a model
_TEXT_ATTRS = ("alt", "title", "aria-label", "placeholder")
_HIDDEN_STYLE = re.compile(
    r"display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$|!)|"
    r"font-size\s*:\s*0(?:\.\d+)?(?:px|pt|em|rem|%)?\s*(?:;|$|!)|"
    r"(?:left|top|text-indent|margin-left)\s*:\s*-\d{3,}|"
    r"(?<![-\w])color\s*:\s*(?:#fff(?:fff)?\b|white\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))", re.IGNORECASE)
_MIN_WORDS = 3  # "Ignore previous instructions" is three; shorter hidden text carries no instruction


def _clean(text: str) -> str:
    """Hidden text as the detectors should read it: NFKC, no invisible characters, one space per run."""
    text = "".join(c for c in unicodedata.normalize("NFKC", text) if unicodedata.category(c) != "Cf")
    return " ".join(text.split())


def _worth_reading(text: str) -> bool:
    return len(text.split()) >= _MIN_WORDS and any(c.isalpha() for c in text)


def _is_hidden(tag: str, attrs: dict[str, str | None]) -> bool:
    if tag in _HIDDEN_TAGS or "hidden" in attrs:
        return True
    if (attrs.get("aria-hidden") or "").strip().lower() == "true":
        return True
    return bool(_HIDDEN_STYLE.search(attrs.get("style") or ""))


class _Splitter(HTMLParser):
    def __init__(self, raw: str):
        super().__init__(convert_charrefs=False)
        self.raw = raw
        self.line_starts = [0] + [m.end() for m in re.finditer("\n", raw)]
        self.chars: list[str] = []
        self.origin: list[int] = []
        self.layers: list[Layer] = []
        self.stack: list[str] = []
        self.skip_depth = 0  # inside <script>/<style>
        self.hidden_at: int | None = None  # stack depth of the outermost hidden element
        self.hidden_start = 0
        self.hidden_text: list[str] = []

    # ---- positions -----------------------------------------------------------------------------
    def _pos(self) -> int:
        line, col = self.getpos()
        return self.line_starts[line - 1] + col

    def _tag_end(self, start: int) -> int:
        end = self.raw.find(">", start)
        return len(self.raw) if end < 0 else end + 1

    # ---- output --------------------------------------------------------------------------------
    def _visible(self, text: str, start: int, one_origin: bool = False) -> None:
        for k, ch in enumerate(text):
            at = start if one_origin else start + k
            if ch.isspace():
                if self.chars and not self.chars[-1].isspace():
                    self.chars.append(" ")
                    self.origin.append(at)
            else:
                self.chars.append(ch)
                self.origin.append(at)

    def _break(self, at: int) -> None:
        if self.chars and self.chars[-1] == " ":
            self.chars[-1] = "\n"
        elif self.chars and self.chars[-1] != "\n":
            self.chars.append("\n")
            self.origin.append(at)

    def _text(self, text: str, start: int, one_origin: bool = False) -> None:
        if self.skip_depth:
            return
        if self.hidden_at is not None:
            self.hidden_text.append(text)
        else:
            self._visible(text, start, one_origin)

    def _layer(self, kind: str, start: int, end: int, text: str) -> None:
        text = _clean(text)
        if _worth_reading(text):
            self.layers.append(Layer(kind, start, end, text, hidden=True))

    def _close_hidden(self, end: int) -> None:
        self._layer(HTML_HIDDEN, self.hidden_start, end, " ".join(self.hidden_text))
        self.hidden_at, self.hidden_text = None, []

    # ---- parser events -------------------------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        start = self._pos()
        raw_tag = self.get_starttag_text() or ""
        attr_map = {k.lower(): v for k, v in attrs}
        if tag in _BLOCK and self.hidden_at is None and not self.skip_depth:
            self._break(start)
        self._attributes(tag, attr_map, start, raw_tag)
        if tag in _VOID:
            return
        self.stack.append(tag)
        if tag in _SKIPPED:
            self.skip_depth += 1
        elif self.hidden_at is None and not self.skip_depth and _is_hidden(tag, attr_map):
            self.hidden_at, self.hidden_start, self.hidden_text = len(self.stack), start, []

    def handle_startendtag(self, tag, attrs):
        start = self._pos()
        attr_map = {k.lower(): v for k, v in attrs}
        if tag in _BLOCK and self.hidden_at is None:
            self._break(start)
        self._attributes(tag, attr_map, start, self.get_starttag_text() or "")

    def _attributes(self, tag: str, attrs: dict[str, str | None], start: int, raw_tag: str) -> None:
        """alt, title, aria-label, placeholder and <meta content> are read by a model, not shown on the page."""
        if self.skip_depth:
            return
        names = [a for a in _TEXT_ATTRS if attrs.get(a)]
        if tag == "meta" and attrs.get("content") and (attrs.get("name") or attrs.get("property")):
            names.append("content")
        for name in names:
            if self.hidden_at is not None:  # already inside a hidden element: part of its layer
                self.hidden_text.append(attrs[name] or "")
                continue
            m = re.search(r"\b" + re.escape(name) + r"\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]+))", raw_tag, re.IGNORECASE)
            if m:
                group = next(g for g in (1, 2, 3) if m.group(g) is not None)
                self._layer(HTML_ATTRIBUTE, start + m.start(group), start + m.end(group), html.unescape(m.group(group)))

    def handle_endtag(self, tag):
        start = self._pos()
        end = self._tag_end(start)
        if tag not in self.stack:
            return
        while self.stack:
            depth = len(self.stack)
            top = self.stack.pop()
            if top in _SKIPPED:
                self.skip_depth -= 1
            if self.hidden_at == depth:
                self._close_hidden(end)
            if top == tag:
                break
        if tag in _BLOCK and self.hidden_at is None and not self.skip_depth:
            self._break(start)

    def handle_data(self, data):
        self._text(data, self._pos())

    def _ref(self, start: int, body_len: int) -> None:
        end = start + body_len
        if end < len(self.raw) and self.raw[end] == ";":
            end += 1
        self._text(html.unescape(self.raw[start:end]), start, one_origin=True)

    def handle_entityref(self, name):
        self._ref(self._pos(), 1 + len(name))

    def handle_charref(self, name):
        self._ref(self._pos(), 2 + len(name))

    def handle_comment(self, data):
        start = self._pos()
        if self.skip_depth:
            return
        if self.hidden_at is not None:
            self.hidden_text.append(data)
            return
        end = self.raw.find("-->", start)
        self._layer(HTML_COMMENT, start, len(self.raw) if end < 0 else end + 3, data)

    def finish(self) -> tuple[View, list[Layer]]:
        self.close()
        if self.hidden_at is not None:  # an unclosed hidden element runs to the end
            self._close_hidden(len(self.raw))
        return View("".join(self.chars), self.origin), self.layers


def split_html(raw: str) -> tuple[View, list[Layer]]:
    """The visible text of an HTML page (positions into the raw HTML) and its hidden layers."""
    splitter = _Splitter(raw)
    splitter.feed(raw)
    return splitter.finish()


def split_ranges(text: str, hidden: list[tuple[str, int, int]]) -> tuple[View, list[Layer]]:
    """Plain text with known hidden ranges (from a PDF or Word file): the rest is the view."""
    covered = [False] * len(text)
    layers = []
    for kind, start, end in sorted(hidden, key=lambda h: h[1]):
        start, end = max(0, start), min(len(text), end)
        for k in range(start, end):
            covered[k] = True
        cleaned = _clean(text[start:end])
        if _worth_reading(cleaned):
            layers.append(Layer(kind, start, end, cleaned, hidden=True))
    keep = [k for k in range(len(text)) if not covered[k]]
    return View("".join(text[k] for k in keep), keep), layers


def split(content: str, fmt: str | None, hidden: list[tuple[str, int, int]] | None = None
          ) -> tuple[View | None, list[Layer]]:
    """The base view and hidden layers for `prepare`; (None, []) for plain text, which needs neither."""
    if fmt == "html":
        return split_html(content)
    if hidden:
        return split_ranges(content, hidden)
    return None, []
