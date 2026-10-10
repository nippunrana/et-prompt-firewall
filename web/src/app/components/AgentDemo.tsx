"use client";

import React, { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { duration, gsap, useGSAP } from "@/lib/motion";
import { pretty, type Email, type InboxEmail, type Scenario } from "@/lib/demo-types";
import dashboard from "@/data/dashboard.json";
import InboxEditor, { withKey } from "./InboxEditor";
import RunDrawer from "./RunDrawer";
import RunResults, { MODES, outcome, type Tone } from "./RunResults";
import { useAgentRuns } from "./useAgentRuns";
import s from "./demo.module.css";

const BLANK_ID = "blank";
const DEFAULT_REQUEST = "Can you go through my unread emails and summarise them for me?";
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

type Measurement = (typeof dashboard.scenarios)[number];

// How often the scenario worked over several measured runs, so one live run is never read as typical
function Measured({ scenario, m }: { scenario: Scenario; m: Measurement }) {
  if (scenario.kind === "task") return <span>Measured over {m.runs} runs: task done {m.protected_done} of {m.runs} times with the firewall on.</span>;
  return (
    <span>
      Measured over {m.runs} runs: the attack worked {m.unprotected_harmful} of {m.runs} times without the firewall, {m.protected_harmful} of {m.runs} with it.
    </span>
  );
}

// Which checkpoint stopped the attack in the measured runs; never a claim the runs did not show
function caught(scenario: Scenario, m: Measurement): [string, string] {
  if (scenario.kind === "task") return ["What should happen", "Nothing to stop: the firewall has to let it through."];
  if (m.types_named.length) return ["Where it\u2019s caught", "Checkpoint 1, the content check, flags the email before the AI reads it."];
  if (m.guard_types.length) return ["Where it\u2019s caught", "The content check lets it through; checkpoint 2, the tool guard, blocks the send."];
  // Nothing fired because the protected agent never acted on it: say so, never "neither stops it"
  if (m.runs && m.protected_harmful === 0) {
    return ["Where it\u2019s caught", "Neither checkpoint had to fire: with the firewall on, the agent never acted on it in the measured runs."];
  }
  return ["Where it\u2019s caught", "Neither checkpoint stops it."];
}

// Share of the labelled LLMail-Inject attacks that use the technique (computed by eval/report_heldout.py)
const { techniques } = dashboard;
const share = (sc: Scenario) =>
  sc.technique ? Math.round((100 * (techniques.counts as Record<string, number>)[sc.technique]) / techniques.n) : null;

// Both steps show at once: the first attack is already picked, so its inbox and the run bar are ready.
// `first` is the number of its first step; `active` is false while another input type is shown.
export default function AgentDemo({ first = 1, active = true }: { first?: number; active?: boolean }) {
  const dock = useRef<HTMLDivElement>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [userRequest, setUserRequest] = useState("");
  const [emails, setEmails] = useState<InboxEmail[]>([]);
  const [baseline, setBaseline] = useState("");
  const [ranAs, setRanAs] = useState<{ scenario: Scenario | null; custom: boolean; emails: Email[] } | null>(null);
  const { jobs, seconds, running, drawerOpen, setDrawerOpen, closeDrawer, start: startRuns, reset } = useAgentRuns();

  // The run bar, fixed to the bottom of the window. It sits outside the step sections, so a transform on
  // one of them can never pin the fixed bar to the section instead of the window.
  const showDock = active && Boolean(selectedId);
  useGSAP(() => {
    if (showDock && dock.current) gsap.fromTo(dock.current, { yPercent: 100 }, { yPercent: 0, duration: duration(0.5), ease: "power3.out" });
  }, { dependencies: [showDock] });

  // While the bar shows, the page gets room for it, so it never covers the last email or the footer
  useEffect(() => {
    if (!showDock || !dock.current) return;
    document.body.style.paddingBottom = `${dock.current.offsetHeight}px`;
    return () => { document.body.style.paddingBottom = ""; };
  }, [showDock, ranAs]);

  useEffect(() => {
    fetch(`${BASE_PATH}/api/scenarios`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setScenarios(data.scenarios);
        pick(data.scenarios[0]);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Could not load the scenarios."));
  }, []);

  const selected = scenarios.find((x) => x.id === selectedId) ?? null;
  const custom = selectedId === BLANK_ID || fingerprint(userRequest, emails) !== baseline;
  const measured = dashboard.scenarios.find((x) => x.id === selectedId);

  function pick(sc: Scenario | null) {
    const request = sc?.user_request ?? DEFAULT_REQUEST;
    const inbox = sc ? sc.emails.map((e) => withKey(e)) : [withKey({ from: "Someone <someone@example.com>", subject: "", body: "" }, "blank")];
    setSelectedId(sc?.id ?? BLANK_ID);
    setUserRequest(request);
    setEmails(inbox);
    setBaseline(fingerprint(request, inbox));
    reset();
  }

  function start() {
    setRanAs({ scenario: selected, custom, emails: emails.map(({ key, added, ...e }) => e) });
    startRuns({ user_request: userRequest, emails: emails.map((e) => ({ from: e.from, subject: e.subject, body: e.body })) });
  }

  if (loadError) return <div className={s.error}>The demo agent is unavailable: {loadError}</div>;
  if (!selectedId) return <p className="muted">Loading scenarios…</p>;

  const emptyEmail = emails.some((e) => !e.body.trim());

  return (
    <div>
      <section className={s.step}>
        <StepHeader n={first} title="Pick an attack"
          hint="The techniques attackers use most against AI email assistants, most common first. Each one opens a realistic inbox with that attack hidden in it." />
        <div className={s.stepBody}>
          <div className={s.chips}>
            {scenarios.filter((sc) => sc.featured).map((sc) => (
              <button key={sc.id} className="chip" aria-pressed={sc.id === selectedId} disabled={running} onClick={() => pick(sc)}>
                {sc.title}
                {share(sc) !== null && <span className={s.chipShare}>{share(sc)}%</span>}
              </button>
            ))}
            <button className="chip" aria-pressed={selectedId === BLANK_ID} disabled={running} onClick={() => pick(null)}>Blank inbox</button>
          </div>
          <p className={s.source}>
            % = share of the {techniques.n} attacks we labelled from Microsoft&apos;s public LLMail-Inject challenge (2025), all of which
            beat an AI email assistant. One attack can use several techniques, so the shares add up to more than 100%.
            Prompt injection is #1 on the OWASP Top 10 for LLM applications.
          </p>
          {selected && !custom && (
            <div className={s.pickNote}>
              <p><strong>How it works:</strong> {selected.how}</p>
              {measured && <p><strong>{caught(selected, measured)[0]}:</strong> {caught(selected, measured)[1]}</p>}
              {measured && (
                <div className={s.scenarioNote}>
                  <Measured scenario={selected} m={measured} />
                  {selected.attack_types.map((t) => <span key={t} className="tag">{pretty(t)}</span>)}
                </div>
              )}
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
          <InboxEditor emails={emails} onChange={setEmails} userRequest={userRequest} disabled={running} kind={selected?.kind} />
        </div>
      </section>

      {showDock && (
        <div ref={dock} className={s.dock} role="region" aria-label="Run both agents">
          <div className={`container ${s.dockInner}`}>
            <div className={s.dockText}>
              <strong className={s.dockTitle}>Run both agents</strong>
              <p className={s.dockLine}>
                {emptyEmail
                  ? "Every email needs a body before the agents can run."
                  : "The same inbox goes to two copies of the agent at once: one with prompt firewall, one without."}
              </p>
              {ranAs && Object.keys(jobs).length > 0 && (
                <p className={s.lastRun}>
                  {MODES.map((m) => {
                    const job = jobs[m.key];
                    const o = job?.status === "done" ? outcome(job, ranAs.scenario, ranAs.custom, m.key === "protected", m.key === "protected" ? undefined : jobs.protected) : null;
                    return (
                      <span key={m.key} className={s.lastRunItem}>
                        <span className={s.lastRunDot} style={{ background: o ? TONE_DOT[o.tone] : job?.status === "error" ? "var(--block)" : "var(--ink-400)" }} />
                        {m.label}: <strong>{o?.title ?? (job?.status === "error" ? "failed" : "running…")}</strong>
                      </span>
                    );
                  })}
                </p>
              )}
            </div>
            <div className={s.dockActions}>
              {ranAs && <button className="btn" onClick={() => setDrawerOpen(true)}>{running ? "Watch the run" : "Open results"}</button>}
              <button className="btn btn--primary" onClick={start} disabled={running || !userRequest.trim() || emptyEmail}>
                {running ? "Running…" : "Run the AI orchestration"}
              </button>
            </div>
          </div>
        </div>
      )}

      {ranAs && (
        <RunDrawer open={drawerOpen} onClose={closeDrawer} title="Same inbox, two agents"
          subtitle={`${ranAs.scenario && !ranAs.custom ? ranAs.scenario.title : "Your own inbox"} · ${ranAs.emails.length} email${ranAs.emails.length === 1 ? "" : "s"} · the tools are fake: nothing is really sent or paid · on the shared server the protected run takes a few minutes`}>
          <RunResults jobs={jobs} seconds={seconds} scenario={ranAs.scenario} custom={ranAs.custom} emails={ranAs.emails} />
        </RunDrawer>
      )}
    </div>
  );
}
