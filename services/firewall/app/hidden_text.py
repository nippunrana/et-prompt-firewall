"""Text a person cannot see in a Word or PDF file, kept in the extracted text with its position.

The extraction must not drop hidden text (the agent reading the file would still get it) and must
not pass it off as ordinary text either: each hidden run is marked, and app/formats.py turns the
marks into hidden layers that every detector reads, with concealment counted as a signal.

Not detected (stated limits): PDF invisible render mode (OCR'd scans use it legitimately, and
pdfplumber does not expose it), text under a shape, text whose colour matches a coloured
background, and footnotes and endnotes in Word.
"""

from __future__ import annotations

from typing import Any

from docx.document import Document
from docx.table import Table
from docx.text.paragraph import Paragraph
from docx.text.run import Run
from docx.shared import Pt

PDF_WHITE, PDF_TINY, PDF_OFF_PAGE = "pdf_white_text", "pdf_tiny_text", "pdf_off_page_text"
DOCX_HIDDEN, DOCX_WHITE, DOCX_TINY, DOCX_COMMENT = "docx_hidden_text", "docx_white_text", "docx_tiny_text", "docx_comment"

TINY_PT = 2.0  # under 2 pt nobody reads it on a page
NEAR_WHITE = 0.95  # every channel this light or lighter counts as white


class Text:
    """Extracted text built piece by piece, remembering where each hidden piece landed."""

    def __init__(self) -> None:
        self.parts: list[str] = []
        self.size = 0
        self.hidden: list[tuple[str, int, int]] = []

    def add(self, piece: str, kind: str | None = None) -> None:
        if not piece:
            return
        if kind:
            self.hidden.append((kind, self.size, self.size + len(piece)))
        self.parts.append(piece)
        self.size += len(piece)

    def extend(self, other: "Text") -> None:
        self.hidden += [(kind, self.size + start, self.size + end) for kind, start, end in other.hidden]
        self.parts += other.parts
        self.size += other.size

    def value(self) -> str:
        return "".join(self.parts).rstrip()  # trailing only: positions stay valid


# ---- PDF ----------------------------------------------------------------------------------------

def _white(color: Any) -> bool:
    if not isinstance(color, (tuple, list)) or not all(isinstance(c, (int, float)) for c in color):
        return False  # patterns and named colour spaces: not judged
    if len(color) == 1:
        return color[0] >= NEAR_WHITE  # grey
    if len(color) == 3:
        return min(color) >= NEAR_WHITE  # RGB
    if len(color) == 4:
        return max(color) <= 1 - NEAR_WHITE  # CMYK: no ink
    return False


def _inside(obj: dict, box: dict) -> bool:
    return box["x0"] <= obj["x0"] and obj["x1"] <= box["x1"] and box["top"] <= obj["top"] and obj["bottom"] <= box["bottom"]


def pdf_hidden_kind(char: dict, page_bbox: tuple[float, float, float, float], backdrops: list[dict]) -> str | None:
    """Why a person would not see this character, or None. White text on a dark box or an image is visible."""
    x0, top, x1, bottom = page_bbox
    if char["x1"] <= x0 or char["x0"] >= x1 or char["bottom"] <= top or char["top"] >= bottom:
        return PDF_OFF_PAGE
    if char.get("size", 99) < TINY_PT:
        return PDF_TINY
    if _white(char.get("non_stroking_color")) and not any(_inside(char, b) for b in backdrops):
        return PDF_WHITE
    return None


def _backdrops(page: Any) -> list[dict]:
    rects = [r for r in page.rects if r.get("fill") and not _white(r.get("non_stroking_color"))]
    return rects + list(page.images)


def pdf_page(page: Any, tables_md) -> Text:
    """One page: tables and text from the visible characters, then each kind of hidden text as its
    own marked block."""
    backdrops = _backdrops(page)
    kinds = {id(c): pdf_hidden_kind(c, page.bbox, backdrops) for c in page.chars}
    visible = page.filter(lambda o: o.get("object_type") != "char" or kinds.get(id(o)) is None)
    out = Text()
    pieces = [md for md in (tables_md(t) for t in visible.extract_tables()) if md]
    text = visible.extract_text(layout=True)
    if text and text.strip():
        pieces.append(text.strip())
    out.add("\n\n".join(pieces))
    for kind in (PDF_WHITE, PDF_TINY, PDF_OFF_PAGE):
        if kind not in kinds.values():
            continue
        hidden = page.filter(lambda o, k=kind: o.get("object_type") == "char" and kinds.get(id(o)) == k).extract_text()
        if hidden and hidden.strip():
            out.add("\n\n" if out.size else "")
            out.add(hidden.strip(), kind)
    return out


# ---- Word ---------------------------------------------------------------------------------------

def docx_hidden_kind(run: Run) -> str | None:
    font, style_font = run.font, run.style.font if run.style is not None else None
    if font.hidden or (style_font is not None and style_font.hidden):
        return DOCX_HIDDEN
    size = font.size or (style_font.size if style_font is not None else None)
    if size is not None and size < Pt(TINY_PT):
        return DOCX_TINY
    rgb = font.color.rgb if font.color is not None and font.color.type is not None else None
    if rgb is not None and min(rgb) >= round(255 * NEAR_WHITE):
        return DOCX_WHITE
    return None


def _runs(paragraph: Paragraph):
    for item in paragraph.iter_inner_content():
        if isinstance(item, Run):
            yield item
        else:  # a hyperlink holds its own runs
            yield from item.runs


def _paragraph(paragraph: Paragraph, out: Text) -> None:
    for run in _runs(paragraph):
        out.add(run.text, docx_hidden_kind(run))


def _table(table: Table, out: Text) -> None:
    for row_idx, row in enumerate(table.rows):
        out.add("| ")
        for cell_idx, cell in enumerate(row.cells):
            if cell_idx:
                out.add(" | ")
            for p_idx, p in enumerate(cell.paragraphs):
                if p_idx:
                    out.add(" ")
                _paragraph(p, out)
        out.add(" |")
        if row_idx == 0:
            out.add("\n| " + " | ".join(["---"] * max(len(row.cells), 1)) + " |")
        out.add("\n")


def _blocks(parent: Any, element: Any, out: Text) -> None:
    """Paragraphs and tables in order, text boxes after the paragraph that anchors them."""
    for child in element.iterchildren():
        tag = child.tag.rsplit("}", 1)[-1]
        if tag == "p":
            paragraph = Paragraph(child, parent)
            mark = out.size
            _paragraph(paragraph, out)
            for box in child.xpath(".//w:txbxContent/w:p"):
                out.add(" ")
                _paragraph(Paragraph(box, parent), out)
            if out.size > mark:
                out.add("\n\n")
        elif tag == "tbl":
            _table(Table(child, parent), out)
            out.add("\n")


def docx_text(doc: Document) -> Text:
    """Body, then headers and footers (each distinct one once), then comments, marked as hidden."""
    out = Text()
    _blocks(doc, doc.element.body, out)
    seen: set[str] = set()
    for section in doc.sections:
        for part in (section.header, section.footer):
            text = "\n".join(p.text for p in part.paragraphs).strip()
            if text and text not in seen:
                seen.add(text)
                _blocks(part, part._element, out)
    comments = [c.text.strip() for c in doc.comments if c.text and c.text.strip()]
    if comments:
        out.add("Comments:\n")
        for comment in comments:
            out.add(comment, DOCX_COMMENT)
            out.add("\n")
    return out
