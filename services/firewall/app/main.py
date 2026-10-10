import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import asdict
from typing import Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app import audit, classifiers
from app.check import run_check, stream_check
from app.guard import ACTION_KIND, check_action, record
from app.judge import judge_from_env
from app.lid import get_lid_gate
from app.ocr import process_document
from app.sandbox import sandbox_from_env

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
        # Without its model the language gate passes every line as English, silently: refuse to start.
        if not (await asyncio.to_thread(get_lid_gate)).available:
            raise RuntimeError("the language gate's GlotLID model did not load")
    # The LLM layers are optional: without their keys, checks still run and say so in every answer.
    app.state.judge, app.state.sandbox = judge_from_env(), sandbox_from_env()
    if not app.state.judge:
        logging.warning("GEMINI_API_KEY is not set: the LLM judge is off")
    if not app.state.sandbox:
        logging.warning("OPENROUTER_API_KEY is not set: the sandbox is off")
    yield


app = FastAPI(title="et-prompt-firewall: firewall", lifespan=lifespan)


class HiddenRange(BaseModel):
    """Text a person cannot see in the document, as /extract-text reports it (white or tiny text, comments …)."""
    kind: str = Field(max_length=50)
    start: int = Field(ge=0)
    end: int = Field(ge=0)


class CheckRequest(BaseModel):
    content: str = Field(min_length=1, max_length=MAX_CHECK_CHARS)
    # The medium the content arrived through. Missing means outside content, never the user.
    source: Literal["user", "email", "document", "web"] | None = None
    # What the user asked the agent to do; the judge and the sandbox read it.
    user_task: str | None = Field(default=None, max_length=2_000)
    # Stated by the caller, never guessed: an email with a stray <br> must not be read as a web page.
    format: Literal["text", "html"] = "text"
    # For text extracted from a file: its hidden ranges, so a caller checks it exactly as /check-file does.
    hidden: list[HiddenRange] | None = Field(default=None, max_length=1_000)

    def hidden_ranges(self) -> list[tuple[str, int, int]] | None:
        return None if self.hidden is None else [(h.kind, h.start, h.end) for h in self.hidden]


async def _run_check(content: str, source: str | None, user_task: str | None, fmt: str | None = None,
                     hidden: list[tuple[str, int, int]] | None = None) -> dict:
    loaded = getattr(app.state, "classifiers", None)
    if loaded is None:
        raise HTTPException(status_code=503, detail="The classifiers are not loaded.")
    async with CHECK_SEMAPHORE:
        result = await asyncio.to_thread(run_check, content, source, loaded, user_task=user_task,
                                         judge=getattr(app.state, "judge", None),
                                         sandbox=getattr(app.state, "sandbox", None), fmt=fmt, hidden=hidden)
    audit.record_check(content, source, result)
    return result


@app.post("/check")
async def check(request: CheckRequest) -> dict:
    return await _run_check(request.content, request.source, request.user_task,
                            "html" if request.format == "html" else None, request.hidden_ranges())


@app.post("/check/stream")
async def check_stream(request: CheckRequest) -> StreamingResponse:
    """The same check as /check, reported live as NDJSON: one line as each stage finishes, then
    {"result": ...}, the answer /check gives. A stream that ends without that line means the check failed."""
    loaded = getattr(app.state, "classifiers", None)
    if loaded is None:
        raise HTTPException(status_code=503, detail="The classifiers are not loaded.")

    async def lines():
        async with CHECK_SEMAPHORE:  # held for the whole stream: one check at a time, as for /check
            stages = stream_check(request.content, request.source, loaded, user_task=request.user_task,
                                  judge=getattr(app.state, "judge", None), sandbox=getattr(app.state, "sandbox", None),
                                  fmt="html" if request.format == "html" else None, hidden=request.hidden_ranges())
            while (event := await asyncio.to_thread(next, stages, None)) is not None:
                if "result" in event:
                    audit.record_check(request.content, request.source, event["result"])
                yield json.dumps(event) + "\n"

    return StreamingResponse(lines(), media_type="application/x-ndjson")


class GuardRequest(BaseModel):
    """A tool call the agent is about to make. The guard never reads content; `untrusted` is used
    only to say where a bad recipient came from."""

    user_request: str = Field(max_length=2_000)
    tool: str = Field(max_length=100)
    args: dict = Field(default_factory=dict)
    contacts: list[str] = Field(default_factory=list, max_length=500)
    untrusted: list[str] = Field(default_factory=list, max_length=50)
    canaries: list[str] = Field(default_factory=list, max_length=10)


@app.post("/guard")
def guard(request: GuardRequest) -> dict:
    decision = check_action(request.tool, request.args, request.user_request, request.contacts,
                            request.untrusted, request.canaries)
    record(decision, request.tool, request.args, request.user_request)
    if request.tool in ACTION_KIND:  # reading is always allowed; logging it would bury the actions
        audit.record_guard(request.tool, asdict(decision))
    return asdict(decision)


@app.get("/audit")
def audit_log(limit: int = Query(default=50, ge=1, le=500)) -> dict:
    """The newest decisions from both checkpoints: what was decided and why, never the checked text."""
    return {"entries": audit.recent(limit)}


@app.get("/health")
def health() -> dict:
    # Liveness only. Docker polls this, so it must not call a model or an outside service.
    return {"service": "firewall", "status": "ok"}


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


@app.post("/check-file")
async def check_file(file: UploadFile = File(...), user_task: str | None = Form(default=None, max_length=2_000)) -> dict:
    """A file checked the way an agent would read it. HTML is checked as HTML; other files are
    extracted first, with their hidden text marked."""
    if file.filename and file.filename.lower().endswith((".html", ".htm")):
        text = (await file.read()).decode("utf-8", errors="replace")
        fmt, hidden, extraction = "html", None, {"filename": file.filename, "method": "html"}
    else:
        extraction = await extract_text(file)
        text, fmt = extraction.get("text") or "", None
        hidden = [(h["kind"], h["start"], h["end"]) for h in extraction.get("hidden", [])]
        extraction = {k: extraction[k] for k in ("filename", "method", "page_count", "duration_ms")}
    if not text.strip():
        raise HTTPException(status_code=422, detail="No text could be found in this file.")
    if len(text) > MAX_CHECK_CHARS:
        raise HTTPException(status_code=413, detail=f"This file holds {len(text):,} characters of text; "
                                                    f"the check takes at most {MAX_CHECK_CHARS:,}.")
    result = await _run_check(text, "web" if fmt == "html" else "document", user_task, fmt, hidden)
    return {**result, "extraction": extraction, "content": text}
