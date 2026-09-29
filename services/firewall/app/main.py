import os

import psycopg
from fastapi import FastAPI, File, HTTPException, UploadFile

from app.ocr import process_document

app = FastAPI(title="et-prompt-firewall: firewall")


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
