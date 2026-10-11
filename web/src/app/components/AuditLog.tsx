"use client";

import React, { useCallback, useEffect, useState } from "react";
import { elapsed, laneMs } from "@/lib/run-audit";
import { clearRuns, HISTORY_EVENT, interrupted, loadRuns, type Lane, type RunRecord } from "@/lib/run-history";
import { HOME_EVENT } from "./AppShell";
import RunDrawer from "./RunDrawer";
import RunReplay from "./RunReplay";
import { outcome, type Tone } from "./RunResults";
import a from "./audit.module.css";

const TONE_DOT: Record<Tone, string> = { good: "var(--allow)", bad: "var(--block)", warn: "var(--sanitise)", neutral: "var(--ink-400)" };
const LANES: [Lane, string][] = [["unprotected", "Without firewall"], ["protected", "With firewall"]];

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function kind(run: RunRecord) {
  if (run.reads === "inbox") return `Inbox · ${run.emails.length} email${run.emails.length === 1 ? "" : "s"}`;
  return run.reads === "request" ? "Pasted message" : run.noun.charAt(0).toUpperCase() + run.noun.slice(1);
}

function laneResult(run: RunRecord, lane: Lane): { tone: Tone; title: string } {
  const job = run.jobs[lane];
  if (!job) return { tone: "neutral", title: interrupted(run) ? "did not finish" : "running…" };
  if (job.status !== "done") return { tone: job.status === "error" ? "bad" : "neutral", title: job.status === "error" ? "failed" : "did not finish" };
  return outcome(job, run.scenario, run.custom, lane === "protected", lane === "protected" ? undefined : run.jobs.protected);
}

// Every run of the two agents, newest first, from this browser's storage only. A run opens in the same drawer as the
// live demo, as a record: how each lane ended, a timeline, what ran or failed, then every step.
export default function AuditLog() {
  const [runs, setRuns] = useState<RunRecord[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    const load = () => setRuns(loadRuns());
    load();
    window.addEventListener(HISTORY_EVENT, load);
    window.addEventListener("storage", load); // another tab recorded a run
    return () => {
      window.removeEventListener(HISTORY_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  if (!runs) return null;
  const shown = runs.find((r) => r.id === openId) ?? null;

  if (runs.length === 0) {
    return (
      <div className={`card ${a.empty}`}>
        <strong>No runs yet</strong>
        <p className="muted">Run the two agents on any input. Each run lands here whole, with both lanes, ready to open and replay.</p>
        <button className="btn btn--primary" onClick={() => window.dispatchEvent(new Event(HOME_EVENT))}>Run the agents</button>
      </div>
    );
  }

  return (
    <div>
      <div className={a.bar}>
        <p className="small muted">{runs.length} run{runs.length === 1 ? "" : "s"}, newest first · the newest 50 are kept</p>
        <button className={`btn btn--ghost ${a.clear}`} onClick={() => { if (window.confirm("Delete every recorded run from this browser?")) clearRuns(); }}>
          Clear history
        </button>
      </div>
      <ul className={a.list}>
        {runs.map((run) => {
          const running = !run.finished && !interrupted(run);
          const took = laneMs(run, "protected");
          return (
            <li key={run.id}>
              <button className={`card ${a.row}`} disabled={running} onClick={() => { setOpenId(run.id); setDrawerOpen(true); }}>
                <span className={`${a.when} num`}>{when(run.started)}</span>
                <span className={a.what}>
                  <strong>{run.title}</strong>
                  <span className="small muted">{kind(run)}{took !== null && run.jobs.protected ? ` · protected run ${elapsed(took)}` : ""}</span>
                </span>
                <span className={a.results}>
                  {LANES.map(([lane, label]) => {
                    const o = laneResult(run, lane);
                    return (
                      <span key={lane} className={a.result}>
                        <span className={a.resultDot} style={{ background: TONE_DOT[o.tone] }} />
                        <span className="muted">{label}:</span> <strong>{o.title}</strong>
                      </span>
                    );
                  })}
                </span>
                <span className={a.open}>{running ? "Running: watch it on Try it" : "Open the run"}</span>
              </button>
            </li>
          );
        })}
      </ul>

      {shown && (
        <RunDrawer open={drawerOpen} onClose={closeDrawer} title={`Run record: ${shown.title}`}
          subtitle={`${when(shown.started)} · ${kind(shown)} · recorded in this browser; a replay of what happened, not a live run`}>
          <RunReplay run={shown} />
        </RunDrawer>
      )}
    </div>
  );
}
