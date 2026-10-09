from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"service": "demo-agent", "status": "ok"}


def test_scenarios_list_the_demo_runs():
    body = client.get("/scenarios").json()
    ids = [s["id"] for s in body["scenarios"]]
    assert "credential-theft" in ids and "legitimate-forward" in ids
    assert all(s["user_request"] and s["emails"] for s in body["scenarios"])


def test_a_background_run_reports_its_steps_and_result(monkeypatch):
    import time

    from app import main

    monkeypatch.setattr(main, "CHAT", lambda messages, tools: {"content": "Nothing to do.", "tool_calls": []})
    job_id = client.post("/runs", json={"user_request": "Hi", "firewall": False, "guard": False}).json()["id"]
    for _ in range(50):
        job = client.get(f"/runs/{job_id}").json()
        if job["status"] != "running":
            break
        time.sleep(0.05)
    assert job["status"] == "done" and job["result"]["answer"] == "Nothing to do."
    assert job["steps"][0]["step"] == "model"
    assert job["live"] is None  # no firewall in this run, so no stage was reported


def test_an_unknown_run_is_404():
    assert client.get("/runs/nope").status_code == 404
