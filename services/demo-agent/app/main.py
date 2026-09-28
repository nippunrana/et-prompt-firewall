"""Demo agent service. Placeholder for the deploy skeleton: it only reports that it runs."""

from fastapi import FastAPI

app = FastAPI(title="et-prompt-firewall: demo agent")


@app.get("/health")
def health() -> dict:
    return {"service": "demo-agent", "status": "ok"}
