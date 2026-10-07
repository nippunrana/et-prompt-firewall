# Demo UI and results dashboard

The Next.js app in `web/`: agent side by side, content checker, results dashboard, audit log. The agent's ready-made scenarios live in `services/demo-agent/app/scenarios.py` and are served by `GET /scenarios`.

## Rules

- **Agent runs are background jobs, polled by the browser** (`POST /runs`, then `GET /runs/{id}` every 1.5 s). A protected run checks every email through the firewall and can take minutes on the VPS, longer than Cloudflare waits for one response (about 100 s). Never switch the UI back to the blocking `POST /run`; that endpoint stays for `eval/run_agent.py`.
- **Jobs live in the agent's memory** (the newest 50). A restart loses them; that is acceptable for a demo.
- **The dashboard only shows saved numbers.** `eval/report_heldout.py` writes `web/src/data/dashboard.json` from the saved runs; the server never runs a benchmark. After a new run, regenerate the file and rebuild `web`.
- **Never show a lucky run as typical.** Every scenario is measured several times by `eval/run_scenarios.py`; the dashboard shows those rates. The unprotected agent does not fall for every attack every time, so the video may need a retake.
- **Every browser `fetch()` starts with `BASE_PATH`** (Next.js does not add it to fetch).
