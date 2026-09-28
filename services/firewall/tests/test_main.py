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
