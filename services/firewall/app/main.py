import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import Literal

import psycopg
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app import classifiers
from app.check import run_check
from app.ocr import process_document

logging.basicConfig(level=logging.INFO)

MAX_CHECK_CHARS = 20_000  # about 3,000 words; longer text needs more time than the proxy allows
# One check at a time: the models are CPU-bound, and the container has one CPU shared with OCR.
CHECK_SEMAPHORE = asyncio.Semaphore(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Loaded before the server accepts requests: a missing or broken model fails the health check,
    # so a bad image is rolled back instead of serving checks without its classifiers.
    if os.environ.get("FIREWALL_LOAD_MODELS", "1") == "1":
        app.state.classifiers = await asyncio.to_thread(classifiers.load)
    yield


app = FastAPI(title="et-prompt-firewall: firewall", lifespan=lifespan)


class CheckRequest(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_CHECK_CHARS)
    # The medium the content arrived through. Missing means outside content, never the user.
    source: Literal["user", "email", "document", "web"] | None = None
    # What the user asked the agent to do; read by the LLM judge once it exists.
    user_task: str | None = Field(default=None, max_length=2_000)


@app.post("/check")
async def check(request: CheckRequest) -> dict:
    loaded = getattr(app.state, "classifiers", None)
    if loaded is None:
        raise HTTPException(status_code=503, detail="The classifiers are not loaded.")
    async with CHECK_SEMAPHORE:
        return await asyncio.to_thread(run_check, request.content, request.source, loaded)


@app.get("/health")
def health() -> dict:
    # Liveness only. Docker polls this, so it must not open a database connection.
    return {"service": "firewall", "status": "ok"}


@app.get("/health/database")
def database_health() -> dict:
    # Always 200: a database outage must not fail the deploy health check, because a rollback cannot fix it.
    url = os.environ.get("DATABASE_URL")
    if not url:
        return {"database": "not configured"}
    try:
        with psycopg.connect(url, connect_timeout=3) as conn:
            conn.execute("SELECT 1")
    except psycopg.Error:
        return {"database": "error"}
    return {"database": "ok"}


@app.post("/extract-text")
async def extract_text(file: UploadFile = File(...)) -> dict:
    """Extracts text and structured tables from images, PDFs, or Word documents."""
    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="A valid file must be uploaded.")

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        import time
        start_t = time.perf_counter()
        result = await process_document(content, filename=file.filename)
        elapsed = time.perf_counter() - start_t
        result["duration_seconds"] = round(elapsed, 3)
        result["duration_ms"] = round(elapsed * 1000)
        return result
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document extraction error: {e}")
