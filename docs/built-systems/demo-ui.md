# Demo UI and results dashboard

The Next.js app in `web/`: one guided "Try it" flow (scenario, editable inbox, agents side by side), results dashboard, audit log, document extraction. The agent's ready-made scenarios live in `services/demo-agent/app/scenarios.py` and are served by `GET /scenarios`.

## Rules

- **Agent runs are background jobs, polled by the browser** (`POST /runs`, then `GET /runs/{id}` every 1.5 s). A protected run checks every email through the firewall and can take minutes on the VPS, longer than Cloudflare waits for one response (about 100 s). Never switch the UI back to the blocking `POST /run`; that endpoint stays for `eval/run_agent.py`.
- **Jobs live in the agent's memory** (the newest 50). A restart loses them; that is acceptable for a demo.
- **The dashboard only shows saved numbers.** `eval/report_heldout.py` writes `web/src/data/dashboard.json` from the saved runs; the server never runs a benchmark. After a new run, regenerate the file and rebuild `web`.
- **Never show a lucky run as typical.** Every scenario is measured several times by `eval/run_scenarios.py`; the dashboard shows those rates. The unprotected agent does not fall for every attack every time, so the video may need a retake.
- **Every browser `fetch()` starts with `BASE_PATH`** (Next.js does not add it to fetch).
- **There is no separate content-checker page** (user decision, 2026-10-07). Single-email checks live on each inbox email ("Check this email"), and the per-attack-type examples are emails testers add to the inbox. The old checker was a separate tab, so testers saw no way to test their own email; don't bring it back.
- **Every field of every email is editable, and testers can add their own** (up to the agent's 10-email limit). Once the inbox or request differs from the scenario, the run outcome only reports what the agent did: the scenario's attacker address no longer says whether an attack worked.
- **Two font families only: Geist and Geist Mono** (via `next/font`, no runtime font requests). Verdict colours (green, amber, red) mean allow, sanitise, block and are used for nothing else.
- **The agent's reply is rendered by `web/src/app/components/Markdown.tsx`, which builds React elements. Never render it as HTML** (no `dangerouslySetInnerHTML`, no Markdown library with raw HTML on): the reply can quote attacker-written email text.
- **Agent runs open in a right-hand drawer, and closing the drawer never cancels a run.** Polling lives in `AgentDemo`, not the drawer, so the run keeps going and "Watch the run" reopens it.
- **Every GSAP duration goes through `duration()` in `web/src/lib/motion.ts`,** which returns 0 for visitors who ask for reduced motion. Never animate with GSAP outside `useGSAP` (it cleans up on unmount), and never put a CSS `transform` on an element GSAP moves: GSAP reads it as a pixel offset and the drawer ends up off screen.
