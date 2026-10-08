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
import csv
import io
import logging
import os
import re
from typing import Any, List, Optional

import docx
import numpy as np
import openpyxl
import pdfplumber
import pypdfium2 as pdfium
from PIL import Image

from app.hidden_text import Text, docx_text, pdf_page

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


def extract_from_docx_sync(docx_bytes: bytes) -> tuple[str, list[tuple[str, int, int]]]:
    """Extracts text and tables natively from Word (.docx) files, with the ranges of hidden text."""
    out = docx_text(docx.Document(io.BytesIO(docx_bytes)))
    return out.value(), out.hidden


def _table_md(tbl: list) -> str:
    tbl_md = []
    for r_idx, row in enumerate(tbl):
        clean_row = [(c or "").strip().replace("\n", " ") for c in row]
        tbl_md.append("| " + " | ".join(clean_row) + " |")
        if r_idx == 0:
            tbl_md.append("| " + " | ".join(["---"] * max(len(clean_row), 1)) + " |")
    return "\n".join(tbl_md)


def extract_from_pdf_sync(pdf_bytes: bytes) -> tuple[str, str, int, list[tuple[str, int, int]]]:
    """Inspects PDF for digital selectable text (with the ranges of hidden text); falls back to OCR if scanned."""
    out = Text()
    total_chars = 0
    page_count = 0

    # 1. Try digital text extraction via pdfplumber
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            page_count = len(pdf.pages)
            for page_idx, page in enumerate(pdf.pages):
                page_text = pdf_page(page, _table_md)
                if page_text.size:
                    total_chars += page_text.size
                    out.add(("\n\n" if out.size else "") + f"--- Page {page_idx + 1} ---\n")
                    out.extend(page_text)
    except Exception as e:
        logger.warning(f"pdfplumber extraction failed: {e}")

    # If digital text exists and is substantive (> 30 characters), return immediately
    if total_chars > 30:
        return out.value(), "digital_pdf", page_count, out.hidden

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

    return "\n\n".join(scanned_pages).strip(), "scanned_pdf_ocr", page_count, []


def extract_from_excel_sync(excel_bytes: bytes) -> tuple[str, int]:
    """Extracts all sheets from an Excel (.xlsx) file and formats them as Markdown tables."""
    wb = openpyxl.load_workbook(io.BytesIO(excel_bytes), data_only=True)
    parts: List[str] = []
    sheet_count = len(wb.sheetnames)

    for sheetname in wb.sheetnames:
        sheet = wb[sheetname]
        rows = list(sheet.iter_rows(values_only=True))
        if not rows:
            continue

        non_empty_rows = [
            r for r in rows
            if any(c is not None and str(c).strip() != "" for c in r)
        ]
        if not non_empty_rows:
            continue

        max_cols = max(len([c for c in r]) for r in non_empty_rows)
        if max_cols == 0:
            continue

        table_md: List[str] = [f"### Sheet: {sheetname}"]
        for idx, row in enumerate(non_empty_rows):
            cells = [str(c if c is not None else "").strip().replace("\n", " ") for c in row]
            while len(cells) < max_cols:
                cells.append("")
            table_md.append("| " + " | ".join(cells) + " |")
            if idx == 0:
                table_md.append("| " + " | ".join(["---"] * max_cols) + " |")

        parts.append("\n".join(table_md))

    return "\n\n".join(parts).strip(), max(sheet_count, 1)


def extract_from_csv_sync(csv_bytes: bytes) -> str:
    """Extracts text from CSV files and formats as a Markdown table."""
    text = csv_bytes.decode("utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    table_md: List[str] = []

    for idx, row in enumerate(reader):
        if not any(c.strip() for c in row):
            continue
        cells = [c.strip().replace("\n", " ") for c in row]
        table_md.append("| " + " | ".join(cells) + " |")
        if idx == 0:
            table_md.append("| " + " | ".join(["---"] * max(len(cells), 1)) + " |")

    return "\n".join(table_md).strip()


def _sync_process_document(file_bytes: bytes, filename: str) -> dict:
    """Dispatches document to the correct extraction strategy based on extension/format."""
    name_lower = filename.lower()

    if name_lower.endswith(".docx"):
        text, hidden = extract_from_docx_sync(file_bytes)
        return {
            "status": "success",
            "filename": filename,
            "method": "word_docx",
            "page_count": 1,
            "text": text,
            "hidden": [{"kind": k, "start": s, "end": e} for k, s, e in hidden],
        }

    if name_lower.endswith(".xlsx"):
        text, sheets = extract_from_excel_sync(file_bytes)
        return {
            "status": "success",
            "filename": filename,
            "method": "excel_xlsx",
            "page_count": sheets,
            "text": text,
        }

    if name_lower.endswith(".csv"):
        text = extract_from_csv_sync(file_bytes)
        return {
            "status": "success",
            "filename": filename,
            "method": "csv",
            "page_count": 1,
            "text": text,
        }

    if name_lower.endswith(".pdf"):
        text, method, pages, hidden = extract_from_pdf_sync(file_bytes)
        return {
            "status": "success",
            "filename": filename,
            "method": method,
            "page_count": pages,
            "text": text,
            "hidden": [{"kind": k, "start": s, "end": e} for k, s, e in hidden],
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
