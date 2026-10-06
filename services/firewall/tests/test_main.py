from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"service": "firewall", "status": "ok"}


def test_database_health_without_url(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    response = client.get("/health/database")
    assert response.status_code == 200
    assert response.json() == {"database": "not configured"}


def test_database_health_unreachable(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://nobody:x@127.0.0.1:1/none")
    response = client.get("/health/database")
    assert response.status_code == 200
    assert response.json() == {"database": "error"}


def test_startup_fails_without_language_model(monkeypatch):
    import pytest

    from app import main

    monkeypatch.setenv("FIREWALL_LOAD_MODELS", "1")
    monkeypatch.setattr(main.classifiers, "load", lambda: [])
    monkeypatch.setattr(main, "get_lid_gate", lambda: type("Gate", (), {"available": False})())
    with pytest.raises(RuntimeError, match="GlotLID"):
        with TestClient(main.app):
            pass
