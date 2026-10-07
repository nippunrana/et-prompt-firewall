from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"service": "firewall", "status": "ok"}


def test_startup_fails_without_language_model(monkeypatch):
    import pytest

    from app import main

    monkeypatch.setenv("FIREWALL_LOAD_MODELS", "1")
    monkeypatch.setattr(main.classifiers, "load", lambda: [])
    monkeypatch.setattr(main, "get_lid_gate", lambda: type("Gate", (), {"available": False})())
    with pytest.raises(RuntimeError, match="GlotLID"):
        with TestClient(main.app):
            pass
