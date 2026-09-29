"""Document and image text/table extraction module for ET Prompt Firewall.

Handles:
- Digital PDFs: extracted via pdfplumber in ~10ms
- Scanned PDFs: converted to images via pypdfium2 and passed to RapidOCR
- Images (PNG, JPG, WEBP, TIFF): processed via RapidOCR (PP-OCRv4) and RapidTable (SLANet)
- Word Documents (.docx): parsed natively via python-docx in ~5ms
- Concurrency control: protected by an asyncio.Semaphore(2) cap.
"""

from __future__ import annotations

import asyncio
import io
import logging
import os
import re
from typing import Any, List, Optional

import docx
import numpy as np
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image

logger = logging.getLogger(__name__)

# Concurrency semaphore: strictly cap at 2 concurrent OCR tasks to protect CPU/RAM
CONCURRENCY_LIMIT = int(os.environ.get("OCR_CONCURRENCY", "2"))
OCR_SEMAPHORE = asyncio.Semaphore(CONCURRENCY_LIMIT)

# Lazy model singletons
_ocr_engine: Optional[Any] = None
_table_engine: Optional[Any] = None


def get_ocr_engine():
    global _ocr_engine
    if _ocr_engine is None:
        try:
            from rapidocr_onnxruntime import RapidOCR
            _ocr_engine = RapidOCR()
            logger.info("RapidOCR engine initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize RapidOCR: {e}")
            raise
    return _ocr_engine


def get_table_engine():
    global _table_engine
    if _table_engine is None:
        try:
            from rapid_table import RapidTable
            _table_engine = RapidTable()
            logger.info("RapidTable engine initialized successfully.")
        except Exception as e:
            logger.warning(f"RapidTable not initialized: {e}. Fallback to spatial clustering.")
            _table_engine = False
    return _table_engine if _table_engine is not False else None


def html_table_to_markdown(html_code: str) -> str:
    """Converts a basic HTML table string to a formatted Markdown table."""
    if not html_code or "<table>" not in html_code:
        return ""
    rows = re.findall(r"<tr>(.*?)</tr>", html_code, re.DOTALL | re.IGNORECASE)
    md_rows: List[str] = []
    for idx, row in enumerate(rows):
        cells = re.findall(r"<t[dh]>(.*?)</t[dh]>", row, re.DOTALL | re.IGNORECASE)
        clean_cells = [re.sub(r"<[^>]+>", "", c).strip().replace("\n", " ") for c in cells]
        if not clean_cells:
            continue
        md_rows.append("| " + " | ".join(clean_cells) + " |")
        if idx == 0:
            md_rows.append("| " + " | ".join(["---"] * len(clean_cells)) + " |")
    return "\n".join(md_rows)


def format_ocr_boxes_to_markdown(ocr_result: Any) -> str:
    """Sorts OCR bounding boxes by Y (line grouping) and X (reading order).

    Preserves multi-column layout and formats tabular text with pipe separators.
    """
    if not ocr_result:
        return ""

    boxes = []
    for item in ocr_result:
        box, text, score = item
        if not text or not str(text).strip():
            continue
        xs = [pt[0] for pt in box]
        ys = [pt[1] for pt in box]
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        height = max(max_y - min_y, 1)
        boxes.append({
            "text": str(text).strip(),
            "min_x": min_x,
            "min_y": min_y,
            "max_x": max_x,
            "max_y": max_y,
            "height": height,
            "center_y": (min_y + max_y) / 2.0,
        })

    if not boxes:
        return ""

    # Sort boxes into horizontal lines
    boxes.sort(key=lambda b: b["min_y"])

    lines: List[List[dict]] = []
    current_line = [boxes[0]]
    current_line_y = boxes[0]["center_y"]
    current_line_height = boxes[0]["height"]

    for b in boxes[1:]:
        y_tolerance = max(current_line_height, b["height"]) * 0.6
        if abs(b["center_y"] - current_line_y) <= y_tolerance:
            current_line.append(b)
            current_line_y = sum(x["center_y"] for x in current_line) / len(current_line)
            current_line_height = max(x["height"] for x in current_line)
        else:
            current_line.sort(key=lambda x: x["min_x"])
            lines.append(current_line)
            current_line = [b]
            current_line_y = b["center_y"]
            current_line_height = b["height"]

    if current_line:
        current_line.sort(key=lambda x: x["min_x"])
        lines.append(current_line)

    formatted_lines: List[str] = []
    for line in lines:
        if len(line) > 1 and (max(b["min_x"] for b in line) - min(b["min_x"] for b in line) > 120):
            # Line has multiple separated columns/cells -> format with table pipe
            line_str = "| " + " | ".join(b["text"] for b in line) + " |"
        else:
            line_str = " ".join(b["text"] for b in line)
        formatted_lines.append(line_str)

    return "\n".join(formatted_lines)


def _extract_from_image_sync(img_array: np.ndarray) -> str:
    """Synchronously run RapidOCR and optionally RapidTable on an image numpy array."""
    ocr = get_ocr_engine()
    ocr_result, _ = ocr(img_array)

    table_engine = get_table_engine()
    table_markdown = ""
    if table_engine is not None:
        try:
            html_table, _, _ = table_engine(img_array, ocr_result)
            table_markdown = html_table_to_markdown(html_table)
        except Exception as e:
            logger.debug(f"Table model inference skipped: {e}")

    text_content = format_ocr_boxes_to_markdown(ocr_result)

    if table_markdown:
        return f"{text_content}\n\n### Extracted Table Structure\n{table_markdown}".strip()
    return text_content.strip()


def extract_from_docx_sync(docx_bytes: bytes) -> str:
    """Extracts text and tables natively from Word (.docx) files."""
    doc = docx.Document(io.BytesIO(docx_bytes))
    parts: List[str] = []

    for element in doc.element.body:
        if element.tag.endswith("p"):
            p = docx.text.paragraph.Paragraph(element, doc)
            text = p.text.strip()
            if text:
                parts.append(text)
        elif element.tag.endswith("tbl"):
            tbl = docx.table.Table(element, doc)
            table_md: List[str] = []
            for row_idx, row in enumerate(tbl.rows):
                # Deduplicate cells while preserving order
                cells = [cell.text.strip().replace("\n", " ") for cell in row.cells]
                table_md.append("| " + " | ".join(cells) + " |")
                if row_idx == 0:
                    table_md.append("| " + " | ".join(["---"] * max(len(cells), 1)) + " |")
            if table_md:
                parts.append("\n".join(table_md))

    return "\n\n".join(parts).strip()


def extract_from_pdf_sync(pdf_bytes: bytes) -> tuple[str, str, int]:
    """Inspects PDF for digital selectable text; falls back to OCR if scanned."""
    pages_text: List[str] = []
    total_chars = 0
    page_count = 0

    # 1. Try digital text extraction via pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            for page_idx, page in enumerate(pdf.pages):
                page_parts = []
                # Check for vector tables in digital PDF
                tables = page.extract_tables()
                if tables:
                    for tbl in tables:
                        tbl_md = []
                        for r_idx, row in enumerate(tbl):
                            clean_row = [(c or "").strip().replace("\n", " ") for c in row]
                            tbl_md.append("| " + " | ".join(clean_row) + " |")
                            if r_idx == 0:
                                tbl_md.append("| " + " | ".join(["---"] * max(len(clean_row), 1)) + " |")
                        if tbl_md:
                            page_parts.append("\n".join(tbl_md))

                text = page.extract_text(layout=True)
                if text and text.strip():
                    page_parts.append(text.strip())

                if page_parts:
                    page_content = "\n\n".join(page_parts)
                    total_chars += len(page_content)
                    pages_text.append(f"--- Page {page_idx + 1} ---\n{page_content}")
    except Exception as e:
        logger.warning(f"pdfplumber extraction failed: {e}")

    # If digital text exists and is substantive (> 30 characters), return immediately
    if total_chars > 30:
        return "\n\n".join(pages_text).strip(), "digital_pdf", page_count

    # 2. Scanned PDF fallback: render each page to image and run RapidOCR
    logger.info("PDF has minimal or no digital text. Falling back to RapidOCR vision scan.")
    scanned_pages: List[str] = []
    try:
        pdf_doc = pdfium.PdfDocument(pdf_bytes)
        page_count = len(pdf_doc)
        for page_idx in range(page_count):
            page = pdf_doc[page_idx]
            pil_image = page.render(scale=2).to_pil().convert("RGB")
            img_arr = np.array(pil_image)
            page_text = _extract_from_image_sync(img_arr)
            if page_text:
                scanned_pages.append(f"--- Page {page_idx + 1} (OCR) ---\n{page_text}")
    except Exception as e:
        logger.error(f"Scanned PDF rendering failed: {e}")
        raise

    return "\n\n".join(scanned_pages).strip(), "scanned_pdf_ocr", page_count


def _sync_process_document(file_bytes: bytes, filename: str) -> dict:
    """Dispatches document to the correct extraction strategy based on extension/format."""
    name_lower = filename.lower()

    if name_lower.endswith(".docx"):
        text = extract_from_docx_sync(file_bytes)
        return {
            "status": "success",
            "filename": filename,
            "method": "word_docx",
            "page_count": 1,
            "text": text,
        }

    if name_lower.endswith(".pdf"):
        text, method, pages = extract_from_pdf_sync(file_bytes)
        return {
            "status": "success",
            "filename": filename,
            "method": method,
            "page_count": pages,
            "text": text,
        }

    # Assume image format (PNG, JPG, JPEG, WEBP, TIFF, BMP)
    try:
        pil_img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
        img_arr = np.array(pil_img)
        text = _extract_from_image_sync(img_arr)
        return {
            "status": "success",
            "filename": filename,
            "method": "image_ocr",
            "page_count": 1,
            "text": text,
        }
    except Exception as e:
        logger.error(f"Failed to process image: {e}")
        raise ValueError(f"Unsupported or corrupted file format: {e}")


async def process_document(file_bytes: bytes, filename: str) -> dict:
    """Processes document with concurrency limit to preserve server stability."""
    async with OCR_SEMAPHORE:
        return await asyncio.to_thread(_sync_process_document, file_bytes, filename)
