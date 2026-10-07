"""The audit log: every decision at both checkpoints, never the checked text."""

import pytest
from fastapi.testclient import TestClient

from app import audit
from app.main import app
from tests.fakes import DIRECT_ATTACK_EMAIL, DIRECT_ATTACK_LINE
from tests.test_check import FAKES


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(audit, "AUDIT_LOG", str(tmp_path / "audit.jsonl"))
    app.state.classifiers = FAKES
    yield TestClient(app)
    del app.state.classifiers


def test_check_decisions_are_logged_without_the_text(client):
    assert client.post("/check", json={"content": DIRECT_ATTACK_EMAIL, "source": "email"}).json()["verdict"] == "sanitise"
    [entry] = client.get("/audit").json()["entries"]
    assert entry["checkpoint"] == "check" and entry["verdict"] == "sanitise" and entry["source"] == "email"
    assert entry["cuts"] >= 1 and entry["types"]
    assert entry["content_chars"] == len(DIRECT_ATTACK_EMAIL)
    assert DIRECT_ATTACK_LINE not in open(audit.AUDIT_LOG).read()


def test_guard_decisions_are_logged_newest_first(client):
    client.post("/check", json={"content": "Lunch at noon?"})
    body = {"user_request": "Summarise my emails", "tool": "send_email",
            "args": {"to": "pay@evil.example", "subject": "x", "body": "y"}}
    assert client.post("/guard", json=body).json()["decision"] == "block"
    entries = client.get("/audit").json()["entries"]
    assert [e["checkpoint"] for e in entries] == ["guard", "check"]
    assert entries[0]["tool"] == "send_email" and "tool_abuse" in entries[0]["types"]
    assert entries[1]["source"] == "unknown"


def test_reads_are_not_logged(client):
    client.post("/guard", json={"user_request": "Summarise my emails", "tool": "read_inbox"})
    assert client.get("/audit").json()["entries"] == []


def test_an_empty_log_reads_as_no_entries(client):
    assert client.get("/audit?limit=5").json() == {"entries": []}


def test_a_log_that_cannot_be_written_never_fails_the_request(client, monkeypatch):
    monkeypatch.setattr(audit, "AUDIT_LOG", "/nonexistent-dir/audit.jsonl")
    assert client.post("/check", json={"content": "Lunch at noon?"}).status_code == 200
