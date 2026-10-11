"use client";

import React, { useMemo } from "react";
import { facts, health, LANE_LABEL, laneMs } from "@/lib/run-audit";
import type { Lane, RunRecord } from "@/lib/run-history";
import { Mark } from "./Pipeline";
import RunResults, { outcome, unsafeReason, type Tone } from "./RunResults";
import RunTimeline from "./RunTimeline";
import StatusIcon from "./StatusIcon";
import a from "./audit.module.css";
import r from "./run.module.css";

const TONE: Record<Tone, string> = { good: r.outcomeGood, bad: r.outcomeBad, warn: r.outcomeWarn, neutral: r.outcomeNeutral };
const LANES: Lane[] = ["unprotected", "protected"];

// One recorded run, read top to bottom: how each lane ended, when each step happened, what ran or failed,
// then the same step-by-step lanes as the live run, rebuilt from the record.
export default function RunReplay({ run }: { run: RunRecord }) {
  const unsafe = useMemo(() => unsafeReason(run.jobs, run.scenario, run.custom), [run]);
  const checks = health(run);
  // The lanes' clocks show the same server-timed durations as the summary above them
  const seconds = Object.fromEntries(LANES.flatMap((l) => { const ms = laneMs(run, l); return ms === null ? [] : [[l, Math.round(ms / 1000)]]; }));

  return (
    <div className={a.replay}>
      <p className={a.asked}><span className="label">You asked the agent</span>&ldquo;{run.request}&rdquo;</p>

      <div className={a.outcomes}>
        {LANES.map((lane) => {
          const job = run.jobs[lane];
          const o = job?.status === "done"
            ? outcome(job, run.scenario, run.custom, lane === "protected", lane === "protected" ? undefined : run.jobs.protected)
            : { tone: "neutral" as Tone, title: job?.status === "error" ? "The run failed" : "Did not finish", detail: job?.error ?? undefined };
          return (
            <section key={lane} className={`card ${a.outcomeCard}`}>
              <h3 className={a.laneName}>{LANE_LABEL[lane]}</h3>
              <div className={`${r.outcome} ${TONE[o.tone]}`}>
                <strong className={r.outcomeTitle}>{"icon" in o && o.icon && <StatusIcon kind={o.icon} size={24} />}{o.title}</strong>
                {o.detail && <p>{o.detail}</p>}
              </div>
              <dl className={a.facts}>
                {facts(run, lane).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
              </dl>
            </section>
          );
        })}
      </div>

      <section className={a.block}>
        <h3 className={a.heading}>What happened, and when</h3>
        <RunTimeline run={run} unsafe={unsafe} />
      </section>

      <section className={a.block}>
        <h3 className={a.heading}>What ran, and what failed</h3>
        <ul className={a.health}>
          {checks.map((c, i) => <li key={i}><Mark state={c.state} /><span>{c.text}</span></li>)}
        </ul>
      </section>

      <section className={a.block}>
        <h3 className={a.heading}>Step by step</h3>
        <p className="small muted">Each agent&apos;s run as it was recorded: every check, layer, action and the reply, with the models and cost.</p>
        <div className={a.lanes}>
          <RunResults jobs={run.jobs} seconds={seconds} scenario={run.scenario} custom={run.custom}
            emails={run.emails} reads={run.reads} noun={run.noun} />
        </div>
      </section>
    </div>
  );
}
