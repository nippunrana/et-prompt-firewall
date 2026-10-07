"use client";

import React, { useEffect, useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";

interface Email {
  from: string;
  subject: string;
  body: string;
  attack?: boolean;
}

interface Scenario {
  id: string;
  title: string;
  kind: "attack" | "phishing" | "task";
  attack_types: string[];
  marker: string | null; // the attacker's address: an action carrying it means the attack worked
  user_request: string;
  emails: Email[];
}

interface Step {
  step: "firewall" | "model" | "tool";
  // firewall
  email_id?: string;
  verdict?: string;
  types?: string[];
  removed?: string[];
  warnings?: string[];
  // model
  reasoning?: string;
  content?: string;
  tool_calls?: { name: string; args: string }[];
  // tool
  name?: string;
  args?: Record<string, string>;
  guard?: { decision: string; reason: string; types: string[] } | null;
}

interface Job {
  status: "running" | "done" | "error";
  steps: Step[];
  result: { answer: string; effects: { tool: string; args: Record<string, string> }[] } | null;
  error: string | null;
}

const MODES = [
  { key: "unprotected", label: "Unprotected agent", firewall: false, guard: false },
  { key: "protected", label: "Protected by the firewall", firewall: true, guard: true },
] as const;
type ModeKey = (typeof MODES)[number]["key"];

const pretty = (s: string) => s.replace(/_/g, " ");
const card: React.CSSProperties = { border: "1px solid #e2e8f0", borderRadius: "8px", padding: "0.6rem 0.8rem", marginBottom: "0.5rem", fontSize: "0.86rem", background: "#ffffff" };
const mono: React.CSSProperties = { fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-word" };
const button = (disabled: boolean): React.CSSProperties => ({
  padding: "0.6rem 1.4rem", background: disabled ? "#94a3b8" : "#2563eb", color: "#ffffff", fontWeight: 600,
  fontSize: "0.95rem", border: "none", borderRadius: "8px", cursor: disabled ? "not-allowed" : "pointer",
});

function describeEffect(e: { tool: string; args: Record<string, string> }) {
  const target = e.args.to || e.args.recipient || "";
  return `${pretty(e.tool)}${target ? ` → ${target}` : ""}`;
}

function Outcome({ job, kind, marker }: { job: Job; kind: Scenario["kind"]; marker: string | null }) {
  if (job.status === "running") return <Banner tone="info" text="Running…" />;
  if (job.status === "error") return <Banner tone="bad" text={`Error: ${job.error}`} />;
  const effects = job.result?.effects ?? [];
  if (kind === "phishing") {
    return marker && (job.result?.answer ?? "").toLowerCase().includes(marker.toLowerCase())
      ? <Banner tone="bad" text="Not caught: the agent passed the attacker's link on to the user. The email gives the AI no instruction, so neither checkpoint flags it." />
      : <Banner tone="good" text="The agent did not pass the link on." />;
  }
  if (kind === "attack") {
    if (effects.length === 0) return <Banner tone="good" text="No harmful action ran." />;
    const hit = effects.filter((e) => marker && JSON.stringify(e.args).toLowerCase().includes(marker.toLowerCase()));
    if (hit.length === 0) return <Banner tone="warn" text={`Not the attack, but an action the user did not ask for: ${effects.map(describeEffect).join("; ")}`} />;
    return <Banner tone="bad" text={`Attack succeeded: ${hit.map(describeEffect).join("; ")}`} />;
  }
  return effects.length > 0
    ? <Banner tone="good" text={`Task done: ${effects.map(describeEffect).join("; ")}`} />
    : <Banner tone="bad" text="The task was not completed." />;
}

function Banner({ tone, text }: { tone: "good" | "bad" | "warn" | "info"; text: string }) {
  const colours = { good: ["#dcfce7", "#15803d"], bad: ["#fee2e2", "#b91c1c"], warn: ["#fef3c7", "#92400e"], info: ["#e0f2fe", "#0369a1"] }[tone];
  return <div style={{ background: colours[0], color: colours[1], fontWeight: 600, padding: "0.6rem 0.8rem", borderRadius: "8px", fontSize: "0.9rem", marginBottom: "0.75rem" }}>{text}</div>;
}

function StepView({ step, protectedRun }: { step: Step; protectedRun: boolean }) {
  if (step.step === "firewall") {
    const clean = step.verdict === "allow";
    return (
      <div style={{ ...card, borderColor: clean ? "#e2e8f0" : "#fcd34d", background: clean ? "#ffffff" : "#fffbeb" }}>
        <strong>🛡 Firewall checked email {step.email_id}:</strong> {step.verdict}
        {step.types && step.types.length > 0 && <span style={{ color: "#b45309" }}> · {step.types.map(pretty).join(", ")}</span>}
        {step.removed?.map((r, i) => (
          <div key={i} style={{ ...mono, color: "#7f1d1d", marginTop: "0.3rem" }}>removed: &ldquo;{r}&rdquo;</div>
        ))}
        {step.warnings && step.warnings.length > 0 && <div style={{ color: "#b45309", marginTop: "0.3rem" }}>⚠️ {step.warnings.join(" · ")}</div>}
      </div>
    );
  }
  if (step.step === "model") {
    return (
      <div style={card}>
        <strong>🤖 Agent</strong>
        {step.tool_calls && step.tool_calls.length > 0
          ? <span> decides to call {step.tool_calls.map((c) => c.name).join(", ")}</span>
          : <span> answers</span>}
        {step.reasoning && (
          <details style={{ marginTop: "0.3rem" }}>
            <summary style={{ cursor: "pointer", color: "#64748b" }}>Its reasoning</summary>
            <div style={{ ...mono, color: "#475569", maxHeight: "14rem", overflowY: "auto", fontSize: "0.8rem" }}>{step.reasoning}</div>
          </details>
        )}
      </div>
    );
  }
  if (step.name === "read_inbox" || step.name === "list_invoices" || step.name === "search_contacts") {
    return <div style={{ ...card, color: "#64748b" }}>📥 {pretty(step.name ?? "")}</div>;
  }
  const blocked = step.guard?.decision === "block";
  return (
    <div style={{ ...card, borderColor: blocked ? "#86efac" : "#fca5a5", background: blocked ? "#f0fdf4" : "#fef2f2" }}>
      <strong>{blocked ? "⛔ Blocked by the tool-call guard: " : "⚡ Ran "}</strong>
      <span style={mono}>{step.name}({Object.entries(step.args ?? {}).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ")})</span>
      {blocked && <div style={{ marginTop: "0.3rem", color: "#166534" }}>{step.guard?.reason}{step.guard?.types.length ? ` [${step.guard.types.map(pretty).join(", ")}]` : ""}</div>}
      {!blocked && protectedRun && step.guard && <div style={{ marginTop: "0.3rem", color: "#475569" }}>The guard allowed it: {step.guard.reason}</div>}
    </div>
  );
}

export default function AgentDemo() {
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Scenario | null>(null);
  const [userRequest, setUserRequest] = useState("");
  const [emails, setEmails] = useState<Email[]>([]);
  const [jobs, setJobs] = useState<Partial<Record<ModeKey, Job>>>({});
  const [elapsed, setElapsed] = useState(0);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

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

  function pick(s: Scenario) {
    setSelected(s);
    setUserRequest(s.user_request);
    setEmails(s.emails.map((e) => ({ ...e })));
    setJobs({});
  }

  async function start() {
    timers.current.forEach(clearInterval);
    timers.current = [];
    setJobs(Object.fromEntries(MODES.map((m) => [m.key, { status: "running", steps: [], result: null, error: null }])));
    const began = Date.now();
    const clock = setInterval(() => setElapsed(Math.round((Date.now() - began) / 1000)), 1000);
    timers.current.push(clock);
    let open = MODES.length;
    const finish = () => { if (--open === 0) clearInterval(clock); };

    await Promise.all(MODES.map(async (m) => {
      const fail = (error: string) => { setJobs((j) => ({ ...j, [m.key]: { status: "error", steps: [], result: null, error } })); finish(); };
      try {
        const response = await fetch(`${BASE_PATH}/api/runs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_request: userRequest, emails: emails.map(({ attack, ...e }) => e), firewall: m.firewall, guard: m.guard }),
        });
        const data = await response.json();
        if (!response.ok) return fail(data.error || "Could not start the run");
        const poll = setInterval(async () => {
          try {
            const job: Job & { error?: string } = await (await fetch(`${BASE_PATH}/api/runs/${data.id}`)).json();
            if (!job.status) { clearInterval(poll); return fail(job.error || "Run lost"); }
            setJobs((j) => ({ ...j, [m.key]: job }));
            if (job.status !== "running") { clearInterval(poll); finish(); }
          } catch { /* a missed poll is retried on the next tick */ }
        }, 1500);
        timers.current.push(poll);
      } catch (e) {
        fail(e instanceof Error ? e.message : "Network error");
      }
    }));
  }

  if (loadError) return <Banner tone="bad" text={`The demo agent is unavailable: ${loadError}`} />;
  if (!selected) return <p style={{ color: "#64748b" }}>Loading scenarios…</p>;

  return (
    <div>
      <p style={{ margin: "0 0 1rem", fontSize: "0.92rem", color: "#475569" }}>
        An email assistant with tools (read the inbox, send, forward, pay). Its tools are fake: nothing is ever really sent or paid.
        The same inbox runs twice at once: once with no protection, once with the firewall checking every email (checkpoint 1)
        and every action (checkpoint 2). You can edit the request and the attacker&apos;s email.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {scenarios.map((s) => (
          <button key={s.id} onClick={() => pick(s)} disabled={running}
            style={{ padding: "6px 12px", borderRadius: "999px", fontSize: "0.85rem", cursor: running ? "not-allowed" : "pointer",
              border: `1px solid ${s.id === selected.id ? "#2563eb" : "#cbd5e1"}`, background: s.id === selected.id ? "#eff6ff" : "#ffffff",
              color: s.id === selected.id ? "#1d4ed8" : "#334155", fontWeight: s.id === selected.id ? 600 : 400 }}>
            {s.title}
          </button>
        ))}
      </div>
      {selected.attack_types.length > 0 && (
        <p style={{ margin: "0 0 0.75rem", fontSize: "0.85rem", color: "#64748b" }}>Types the firewall named in every measured run of this scenario: {selected.attack_types.map(pretty).join(", ")}</p>
      )}

      <label style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0f172a" }}>The user asks the agent:</label>
      <input value={userRequest} onChange={(e) => setUserRequest(e.target.value)} disabled={running}
        style={{ width: "100%", boxSizing: "border-box", padding: "0.5rem 0.7rem", margin: "0.3rem 0 1rem", borderRadius: "8px", border: "1px solid #cbd5e1", fontSize: "0.92rem" }} />

      <div style={{ fontSize: "0.9rem", fontWeight: 600, color: "#0f172a", marginBottom: "0.3rem" }}>Inbox ({emails.length} emails)</div>
      {emails.map((e, i) => (
        <details key={i} open={e.attack} style={{ ...card, borderColor: e.attack ? "#fca5a5" : "#e2e8f0" }}>
          <summary style={{ cursor: "pointer" }}>
            {i + 1}. <strong>{e.subject}</strong> <span style={{ color: "#64748b" }}>from {e.from}</span>
            {e.attack && <span style={{ marginLeft: "0.5rem", color: "#b91c1c", fontWeight: 600 }}>attacker&apos;s email</span>}
          </summary>
          {e.attack ? (
            <textarea value={e.body} disabled={running} rows={6}
              onChange={(ev) => setEmails(emails.map((x, j) => (j === i ? { ...x, body: ev.target.value } : x)))}
              style={{ ...mono, width: "100%", boxSizing: "border-box", marginTop: "0.4rem", fontSize: "0.84rem", padding: "0.5rem", borderRadius: "6px", border: "1px solid #fecaca" }} />
          ) : (
            <div style={{ ...mono, marginTop: "0.4rem", color: "#334155" }}>{e.body}</div>
          )}
        </details>
      ))}

      <div style={{ display: "flex", alignItems: "center", gap: "1rem", margin: "1rem 0" }}>
        <button onClick={start} disabled={running || !userRequest.trim()} style={button(running || !userRequest.trim())}>
          {running ? "Running…" : "Run both agents"}
        </button>
        {(running || elapsed > 0) && <span style={{ fontSize: "0.85rem", color: "#64748b" }}>⏱️ {elapsed} s{running ? " (the protected run checks every email; on the live server this takes a few minutes)" : ""}</span>}
      </div>

      {Object.keys(jobs).length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(22rem, 1fr))", gap: "1rem" }}>
          {MODES.map((m) => {
            const job = jobs[m.key];
            if (!job) return null;
            return (
              <div key={m.key} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "12px", padding: "1rem" }}>
                <h3 style={{ margin: "0 0 0.75rem", fontSize: "1rem", color: "#0f172a" }}>{m.label}</h3>
                <Outcome job={job} kind={selected.kind} marker={selected.marker} />
                {job.steps.map((s, i) => <StepView key={i} step={s} protectedRun={m.key === "protected"} />)}
                {job.result?.answer && (
                  <div style={{ ...card, borderColor: "#bfdbfe", background: "#eff6ff" }}>
                    <strong>What the agent told the user:</strong>
                    <div style={{ whiteSpace: "pre-wrap", marginTop: "0.3rem", color: "#1e293b" }}>{job.result.answer}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
