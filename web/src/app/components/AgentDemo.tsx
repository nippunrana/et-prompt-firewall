"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { pretty, type Email, type InboxEmail, type Job, type Scenario } from "@/lib/demo-types";
import dashboard from "@/data/dashboard.json";
import InboxEditor, { withKey } from "./InboxEditor";
import RunDrawer from "./RunDrawer";
import RunResults, { MODES, outcome, type ModeKey, type Tone } from "./RunResults";
import s from "./demo.module.css";

const BLANK_ID = "blank";
const DEFAULT_REQUEST = "Can you go through my unread emails and summarise them for me?";
const REPO = "https://github.com/nippunrana/et-prompt-firewall";
const TONE_DOT: Record<Tone, string> = { good: "var(--allow)", bad: "var(--block)", warn: "var(--sanitise)", neutral: "var(--ink-400)" };

// Comparable form of an inbox, to tell whether the tester changed the scenario
const fingerprint = (request: string, emails: { from: string; subject: string; body: string }[]) =>
  JSON.stringify([request, emails.map((e) => [e.from, e.subject, e.body])]);

export function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <>
      <span className={s.stepNum}>{n}</span>
      <div>
        <h2 className={s.stepTitle}>{title}</h2>
        {hint && <p className={s.stepHint}>{hint}</p>}
      </div>
    </>
  );
}

// How often the scenario worked over several measured runs, so one live run is never read as typical
function Measured({ scenario }: { scenario: Scenario }) {
  const m = dashboard.scenarios.find((x) => x.id === scenario.id);
  if (!m) return null;
  if (scenario.kind === "task") return <span>Measured over {m.runs} runs: task done {m.protected_done} of {m.runs} times with the firewall on.</span>;
  return (
    <span>
      Measured over {m.runs} runs: the attack worked {m.unprotected_harmful} of {m.runs} times without the firewall, {m.protected_harmful} of {m.runs} with it.
    </span>
  );
}

// `first` is the number of its first step: the input-type choice above it is step 1.
export default function AgentDemo({ first = 1 }: { first?: number }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userRequest, setUserRequest] = useState("");
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [baseline, setBaseline] = useState("");
  const [jobs, setJobs] = useState<Partial<Record<ModeKey, Job>>>({});
  const [seconds, setSeconds] = useState<Partial<Record<ModeKey, number>>>({});
  const [ranAs, setRanAs] = useState<{ scenario: Scenario | null; custom: boolean; emails: Email[] } | null>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  useEffect(() => {
    fetch(`${BASE_PATH}/api/scenarios`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setScenarios(data.scenarios);
        pick(data.scenarios[0]);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load the scenarios."));
    return () => timers.current.forEach(clearInterval);
  }, []);

  const running = Object.values(jobs).some((j) => j?.status === "running");
  const selected = scenarios.find((x) => x.id === selectedId) ?? null;
  const custom = selectedId === BLANK_ID || fingerprint(userRequest, emails) !== baseline;

  function pick(sc: Scenario | null) {
    const request = sc?.user_request ?? DEFAULT_REQUEST;
    const inbox = sc ? sc.emails.map((e) => withKey(e)) : [withKey({ from: "Someone <someone@example.com>", subject: "", body: "" }, "blank")];
    setSelectedId(sc?.id ?? BLANK_ID);
    setUserRequest(request);
    setEmails(inbox);
    setBaseline(fingerprint(request, inbox));
    setJobs({});
    setSeconds({});
  }

  async function start() {
    timers.current.forEach(clearInterval);
    timers.current = [];
    setRanAs({ scenario: selected, custom, emails: emails.map(({ key, added, ...e }) => e) });
    setJobs(Object.fromEntries(MODES.map((m) => [m.key, { status: "running", steps: [], result: null, error: null }])));
    setSeconds({});
    setDrawerOpen(true);

    const began = Date.now();
    const open = new Set<ModeKey>(MODES.map((m) => m.key));
    const tick = () => {
      const now = Math.round((Date.now() - began) / 1000);
      setSeconds((prev) => ({ ...prev, ...Object.fromEntries([...open].map((k) => [k, now])) }));
    };
    const clock = setInterval(tick, 1000);
    timers.current.push(clock);
    const finish = (key: ModeKey) => {
      tick();
      open.delete(key);
      if (open.size === 0) clearInterval(clock);
    };
    const inbox = emails.map((e) => ({ from: e.from, subject: e.subject, body: e.body }));

    await Promise.all(MODES.map(async (m) => {
      const fail = (error: string) => { setJobs((j) => ({ ...j, [m.key]: { status: "error", steps: [], result: null, error } })); finish(m.key); };
      try {
        const response = await fetch(`${BASE_PATH}/api/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_request: userRequest, emails: inbox, firewall: m.firewall, guard: m.guard }),
        });
        const data = await response.json();
        if (!response.ok) return fail(data.error || "Could not start the run");
        const poll = setInterval(async () => {
          try {
            const job: Job & { error?: string } = await (await fetch(`${BASE_PATH}/api/runs/${data.id}`)).json();
            if (!job.status) { clearInterval(poll); return fail(job.error || "Run lost"); }
            setJobs((j) => ({ ...j, [m.key]: job }));
            if (job.status !== "running") { clearInterval(poll); finish(m.key); }
          } catch { /* a missed poll is retried on the next tick */ }
        }, 1500);
        timers.current.push(poll);
      } catch (e) {
        fail(e instanceof Error ? e.message : "Network error");
      }
    }));
  }

  if (loadError) return <div className={s.error}>The demo agent is unavailable: {loadError}</div>;
  if (!selectedId) return <p className="muted">Loading scenarios…</p>;

  const emptyEmail = emails.some((e) => !e.body.trim());

  return (
    <div>
      <section className={s.step}>
        <StepHeader n={first} title="Pick a starting point" hint="Each scenario is a realistic inbox with one attack hidden in it. Or start from a blank inbox." />
        <div className={s.stepBody}>
          <div className={s.chips}>
            {scenarios.map((sc) => (
              <button key={sc.id} className="chip" aria-pressed={sc.id === selectedId} disabled={running} onClick={() => pick(sc)}>{sc.title}</button>
            ))}
            <button className="chip" aria-pressed={selectedId === BLANK_ID} disabled={running} onClick={() => pick(null)}>Blank inbox</button>
          </div>
          {selected && !custom && (
            <div className={s.scenarioNote}>
              <Measured scenario={selected} />
              {selected.attack_types.map((t) => <span key={t} className="tag">{pretty(t)}</span>)}
            </div>
          )}
          {custom && (
            <p className={s.scenarioNote}>
              {selectedId === BLANK_ID ? "Your own inbox" : "You changed this scenario"}: the results will report what each agent actually did.
            </p>
          )}
        </div>
      </section>

      <section className={s.step}>
        <StepHeader n={first + 1} title="Edit the inbox" hint="Change anything: the request, the sender, the subject or the body. Add your own email, or one of the example attacks." />
        <div className={s.stepBody}>
          <label>
            <span className="label">You ask the agent</span>
            <input className="field" value={userRequest} disabled={running} maxLength={2000} onChange={(e) => setUserRequest(e.target.value)} />
          </label>
          <InboxEditor emails={emails} onChange={setEmails} userRequest={userRequest} disabled={running} />
        </div>
      </section>

      <section className={s.step}>
        <StepHeader n={first + 2} title="Run both agents" hint="The same inbox goes to two copies of the agent at once. Its tools are fake: nothing is ever really sent or paid." />
        <div className={s.stepBody}>
          <div className={s.runBar}>
            <button className="btn btn--primary" onClick={start} disabled={running || !userRequest.trim() || emptyEmail}>
              {running ? "Running…" : "Run both agents"}
            </button>
            <p className={s.runNote}>
              {emptyEmail
                ? "Every email needs a body before the agents can run."
                : <>On this shared server the firewall has 1.5 CPUs and 3 GB of memory, so the protected run takes a few minutes. For full speed, <a href={`${REPO}#readme`} target="_blank" rel="noreferrer">run it on your own machine</a>.</>}
            </p>
          </div>
          {ranAs && Object.keys(jobs).length > 0 && (
            <div className={s.lastRun}>
              <span className="label">{running ? "Running now" : "Last run"}</span>
              {MODES.map((m) => {
                const job = jobs[m.key];
                const o = job?.status === "done" ? outcome(job, ranAs.scenario, ranAs.custom, m.key === "protected") : null;
                return (
                  <span key={m.key} className={s.lastRunItem}>
                    <span className={s.lastRunDot} style={{ background: o ? TONE_DOT[o.tone] : job?.status === "error" ? "var(--block)" : "var(--ink-400)" }} />
                    {m.label}: <strong>{o?.title ?? (job?.status === "error" ? "failed" : "running…")}</strong>
                  </span>
                );
              })}
              <button className="btn" onClick={() => setDrawerOpen(true)}>{running ? "Watch the run" : "Open results"}</button>
            </div>
          )}
        </div>
      </section>

      {ranAs && (
        <RunDrawer open={drawerOpen} onClose={closeDrawer} title="Same inbox, two agents"
          subtitle={`${ranAs.scenario && !ranAs.custom ? ranAs.scenario.title : "Your own inbox"} · ${ranAs.emails.length} email${ranAs.emails.length === 1 ? "" : "s"} · the tools are fake: nothing is really sent or paid`}>
          <RunResults jobs={jobs} seconds={seconds} scenario={ranAs.scenario} custom={ranAs.custom} emails={ranAs.emails} />
        </RunDrawer>
      )}
    </div>
  );
}
