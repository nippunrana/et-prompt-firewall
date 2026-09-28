"""Firewall service. Placeholder for the deploy skeleton: it reports that it runs and can reach its database."""

import os

import psycopg
from fastapi import FastAPI

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
