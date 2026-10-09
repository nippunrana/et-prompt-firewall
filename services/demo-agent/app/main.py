"""Demo agent service: an email assistant that can run with or without the firewall's two checkpoints."""

import asyncio
import secrets
import threading
from collections import OrderedDict

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app import agent
from app.llm import chat_from_env
from app.scenarios import BENIGN_INBOX, CONTACTS, SCENARIOS

app = FastAPI(title="et-prompt-firewall: demo agent")
CHAT = chat_from_env()
MAX_JOBS = 50  # finished runs kept for the UI to read; the oldest are dropped
JOBS: OrderedDict[str, dict] = OrderedDict()


class Email(BaseModel):
    sender: str = Field(alias="from", max_length=300)
    subject: str = Field(max_length=500)
    body: str = Field(max_length=20_000)


class RunRequest(BaseModel):
    user_request: str = Field(min_length=1, max_length=2_000)
    # The inbox; defaults to the ordinary demo emails. Add a poisoned email to show an attack.
    emails: list[Email] | None = Field(default=None, max_length=10)
    contacts: list[str] | None = Field(default=None, max_length=100)
    firewall: bool = True  # checkpoint 1: emails go through /check before the agent reads them
    guard: bool = True  # checkpoint 2: tool calls go through /guard before they run


def _settings(request: RunRequest) -> agent.Settings:
    if CHAT is None:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY is not set: the agent has no model.")
    emails = [{"from": e.sender, "subject": e.subject, "body": e.body} for e in request.emails] \
        if request.emails is not None else BENIGN_INBOX
    return agent.Settings(chat=CHAT, user_request=request.user_request, emails=emails,
                          contacts=request.contacts if request.contacts is not None else CONTACTS,
                          firewall=request.firewall, guard=request.guard)


@app.get("/health")
def health() -> dict:
    return {"service": "demo-agent", "status": "ok"}


@app.get("/scenarios")
def scenarios() -> dict:
    return {"scenarios": SCENARIOS, "contacts": CONTACTS}


@app.post("/run")
async def run(request: RunRequest) -> dict:
    return await asyncio.to_thread(agent.run, _settings(request))


@app.post("/runs")
def start_run(request: RunRequest) -> dict:
    """Starts a run in the background and returns its id at once. A protected run can take minutes on a
    small server, longer than a proxy waits for one response, so the UI polls GET /runs/{id} instead."""
    settings = _settings(request)
    job_id = secrets.token_hex(8)
    job = {"status": "running", "steps": [], "result": None, "error": None, "live": None}
    settings.on_step = job["steps"].append

    def on_check(email_id: str, stage: dict) -> None:
        # The firewall stages finished so far for the email being checked. Replaced whole, never edited in
        # place: GET /runs/{id} may be serialising the job on another thread at this moment.
        live = job["live"]
        done = live["stages"] if live and live["email_id"] == email_id else []
        job["live"] = {"email_id": email_id, "stages": [*done, stage]}

    settings.on_check = on_check
    JOBS[job_id] = job
    while len(JOBS) > MAX_JOBS:
        JOBS.popitem(last=False)

    def work() -> None:
        try:
            job["result"] = agent.run(settings)
            job["live"] = None  # no email is being checked any more
            job["status"] = "done"
        except Exception as e:  # reported to the UI, never swallowed
            job["error"], job["status"] = f"{type(e).__name__}: {e}", "error"

    threading.Thread(target=work, daemon=True).start()
    return {"id": job_id}


@app.get("/runs/{job_id}")
def get_run(job_id: str) -> dict:
    job = JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="No such run (it may have expired).")
    return job
