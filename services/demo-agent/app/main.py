"""Demo agent service: an email assistant that can run with or without the firewall's two checkpoints."""

import asyncio

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app import agent
from app.llm import chat_from_env
from app.scenarios import BENIGN_INBOX, CONTACTS

app = FastAPI(title="et-prompt-firewall: demo agent")
CHAT = chat_from_env()


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


@app.get("/health")
def health() -> dict:
    return {"service": "demo-agent", "status": "ok"}


@app.post("/run")
async def run(request: RunRequest) -> dict:
    if CHAT is None:
        raise HTTPException(status_code=503, detail="OPENROUTER_API_KEY is not set: the agent has no model.")
    emails = [{"from": e.sender, "subject": e.subject, "body": e.body} for e in request.emails] \
        if request.emails is not None else BENIGN_INBOX
    settings = agent.Settings(chat=CHAT, user_request=request.user_request, emails=emails,
                              contacts=request.contacts if request.contacts is not None else CONTACTS,
                              firewall=request.firewall, guard=request.guard)
    return await asyncio.to_thread(agent.run, settings)
