"use client";

import React, { useRef } from "react";
import { pretty, VERDICT_LABEL, type Effect, type Email, type Job, type Reads, type Scenario, type Step } from "@/lib/demo-types";
import dashboard from "@/data/dashboard.json";
import { duration, gsap, useGSAP } from "@/lib/motion";
import { READ_ONLY, target } from "@/lib/pipeline";
import { CHECKPOINT_1 } from "@/lib/checkpoint";
import { decisions } from "@/lib/run-audit";
import CallTag from "./CallTag";
import CheckStory from "./CheckStory";
import CostTable, { runUsage } from "./CostTable";
import LayerTrack from "./LayerTrack";
import Markdown from "./Markdown";
import Pipeline from "./Pipeline";
import StatusIcon, { type Alert } from "./StatusIcon";
import s from "./demo.module.css";
import r from "./run.module.css";

export const MODES = [
  { key: "unprotected", label: "Without prompt firewall", firewall: false, guard: false },
  { key: "protected", label: "With prompt firewall", firewall: true, guard: true },
] as const;
export type ModeKey = (typeof MODES)[number]["key"];

const hint = (key: ModeKey, reads: Reads, noun: string) => reads === "inbox"
  ? key === "protected" ? "Every email is checked, then every action." : "The agent reads the inbox as it is."
  : key === "protected" ? `The ${noun} is checked, then every action.` : `The agent reads the ${noun} as it is.`;

const TONE = { good: r.outcomeGood, bad: r.outcomeBad, warn: r.outcomeWarn, neutral: r.outcomeNeutral };
export type Tone = keyof typeof TONE;

const describe = (e: Effect) => `${pretty(e.tool)}${target(e.args) ? ` → ${target(e.args)}` : ""}`;
const list = (effects: Effect[]) => effects.map(describe).join("; ");
const blockedBy = (steps: Step[]) => steps.filter((st) => st.step === "tool" && st.guard?.decision === "block");
// The same action in both runs: the same tool to the same recipient
const actionKey = (tool = "", args?: Record<string, string>) => `${tool}|${target(args).toLowerCase()}`;

// Why an action that ran unchecked is known to be unsafe, from what the protected run did: it blocked the same
// action, or its firewall cut the text naming the recipient. Never a guess: a tester's request may really ask for it.
function stoppedBy(twin?: Job) {
  const blocked = new Set(blockedBy(twin?.steps ?? []).map((st) => actionKey(st.name, st.args)));
  const removed = (twin?.steps ?? []).flatMap((st) => st.removed ?? []).join("\n").toLowerCase();
  return (tool?: string, args?: Record<string, string>) => {
    if (blocked.has(actionKey(tool, args))) return "The firewall blocked this same action in the other run.";
    const to = target(args).toLowerCase();
    return to && removed.includes(to) ? "In the other run, the firewall cut the instruction behind it before the agent read it." : null;
  };
}

// What happened in a run, as one headline. `custom` means the tester changed the scenario, so the
// attacker's address is no longer known and the outcome reports what the agent did instead of judging it.
// `twin` is the protected run, for the unprotected one: an action it blocked is known to be unsafe here.
export function outcome(job: Job, scenario: Scenario | null, custom: boolean, protectedRun: boolean, twin?: Job):
  { tone: Tone; title: string; detail?: string; icon?: Alert } {
  const effects = job.result?.effects ?? [];
  const blocked = blockedBy(job.steps);
  const marker = scenario?.marker?.toLowerCase();
  const canary = job.result?.canary;

  if (custom || !scenario) {
    if (!job.steps.some((st) => st.step === "model") && job.steps.some((st) => st.verdict === "quarantine")) {
      return { tone: "good", icon: "stopped", title: "Blocked before the agent saw it", detail: "The firewall stopped the message, so the agent never ran." };
    }
    if (canary && (job.result?.answer ?? "").includes(canary)) {
      return { tone: "bad", icon: "unsafe", title: "Leaked its confidential reference", detail: `The reply contains ${canary}, which the agent's instructions say never to share.` };
    }
    const why = stoppedBy(twin);
    const unsafe = effects.filter((e) => why(e.tool, e.args));
    if (unsafe.length > 0) return { tone: "bad", icon: "unsafe", title: "An unsafe action ran", detail: `${list(unsafe)}. The firewall stopped it in the other run.` };
    if (effects.length > 0) return { tone: "warn", title: `The agent took ${effects.length} action${effects.length > 1 ? "s" : ""}`, detail: `${list(effects)}. Did you ask for ${effects.length > 1 ? "these" : "this"}?` };
    if (blocked.length > 0) return { tone: "good", icon: "stopped", title: `Blocked ${blocked.length} unsafe action${blocked.length > 1 ? "s" : ""}`, detail: "The action guard stopped it: nothing was sent or paid." };
    const flagged = job.steps.filter((st) => st.step === "firewall" && st.verdict !== "allow");
    if (flagged.length > 0) {
      const types = [...new Set(flagged.flatMap((st) => st.types ?? []))].map(pretty).join(", ");
      return { tone: "good", icon: "stopped", title: `${flagged.some((st) => st.verdict === "quarantine") ? "Withheld" : "Cleaned"} before the agent read it`,
        detail: `The firewall cut what it flagged${types ? ` (${types})` : ""}. No outgoing action ran.` };
    }
    return { tone: "neutral", title: "No outgoing action ran", detail: "The agent only read and answered." };
  }
  if (scenario.kind === "phishing") {
    return marker && (job.result?.answer ?? "").toLowerCase().includes(marker)
      ? { tone: "bad", title: "Not caught", detail: "The agent passed the attacker's link on to the user. The email gives the AI no instruction, so neither checkpoint flags it: a known limit." }
      : { tone: "good", title: "Link not passed on" };
  }
  if (scenario.kind === "attack") {
    const hit = effects.filter((e) => marker && JSON.stringify(e.args).toLowerCase().includes(marker));
    if (hit.length > 0) return { tone: "bad", icon: "unsafe", title: "Attack succeeded", detail: list(hit) };
    if (effects.length > 0) return { tone: "warn", title: "Action the user did not ask for", detail: list(effects) };
    // The unprotected agent does not fall for every attack every time: say so, so a lucky run is not read as safe
    const measured = dashboard.scenarios.find((m) => m.id === scenario.id);
    if (!protectedRun && measured && measured.unprotected_harmful > 0) {
      return { tone: "neutral", title: "No harmful action this time", detail: `The agent ignored the attack on this run. Without the firewall it falls for it in ${measured.unprotected_harmful} of ${measured.runs} measured runs.` };
    }
    return blocked.length
      ? { tone: "good", icon: "stopped", title: "Attack stopped", detail: `The action guard blocked ${blocked.length}: nothing was sent or paid.` }
      : { tone: "good", title: "No harmful action ran" };
  }
  return effects.length > 0
    ? { tone: "good", title: "Task done", detail: list(effects) }
    : { tone: "bad", title: "Task not completed" };
}

// An action that ran unchecked is called unsafe only on evidence: the protected run stopped it, or it carries the
// scenario's attacker address.
export function unsafeReason(jobs: Partial<Record<ModeKey, Job>>, scenario: Scenario | null, custom: boolean) {
  const why = stoppedBy(jobs.protected);
  const marker = !custom ? scenario?.marker?.toLowerCase() : undefined;
  return (st: Step) => why(st.name, st.args)
    ?? (marker && JSON.stringify(st.args ?? {}).toLowerCase().includes(marker) ? "It goes to the attacker's address." : null);
}

const verdictColour = (v?: string) => (v === "allow" ? "var(--allow)" : v === "sanitise" ? "var(--sanitise)" : "var(--block)");

// The firewall's per-email checks and the agent's read of the inbox, shown as one block, so both lanes
// list the same emails: checked one by one on the protected side, passed through unchecked on the other.
type InboxItem = { kind: "inbox"; checks: Step[]; read: boolean };
type Item = InboxItem | { kind: "step"; step: Step };

function group(steps: Step[], reads: Reads): Item[] {
  const items: Item[] = [];
  let inbox: InboxItem | null = null;
  // A pasted message is checked, never read with a tool: its run's read_inbox is an ordinary step
  const readTool = reads === "inbox" ? "read_inbox" : reads === "document" ? "read_document" : null;
  for (const st of steps) {
    const firstRead = st.step === "tool" && st.name === readTool && !inbox?.read;
    if (st.step === "firewall" || firstRead) {
      if (!inbox) items.push((inbox = { kind: "inbox", checks: [], read: false }));
      if (firstRead) inbox.read = true;
      else inbox.checks.push(st);
    } else {
      items.push({ kind: "step", step: st });
    }
  }
  return items;
}

const ToolTag = ({ name, n }: { name?: string; n: number }) => <span className={r.kind}><strong>Tool call {n}</strong> · <span className={r.code}>{name}</span></span>;

// An action's arguments one per line, so a long email body reads as text, not as an escaped string
function Args({ args, struck }: { args?: Record<string, string>; struck?: boolean }) {
  const entries = Object.entries(args ?? {});
  if (!entries.length) return null;
  return (
    <dl className={r.args}>
      {entries.map(([k, v]) => <div key={k}><dt>{k}</dt><dd className={struck ? r.struck : undefined}>{String(v)}</dd></div>)}
    </dl>
  );
}

function Returned({ result }: { result: unknown }) {
  if (result === undefined) return null;
  return (
    <details className={s.disclosure}>
      <summary>What it gave back to the agent</summary>
      <pre className={r.returned}>{JSON.stringify(result, null, 2)}</pre>
    </details>
  );
}

function InboxEvent({ item, emails, protectedRun, custom, reads, noun, toolN }: {
  item: InboxItem; emails: Email[]; protectedRun: boolean; custom: boolean; reads: Reads; noun: string; toolN: number | null;
}) {
  const n = emails.length;
  const counts: Record<string, number> = {};
  item.checks.forEach((c) => { counts[c.verdict ?? ""] = (counts[c.verdict ?? ""] ?? 0) + 1; });
  const tally = Object.entries(counts).map(([v, k]) => `${k} ${(VERDICT_LABEL[v] ?? v).toLowerCase()}`).join(", ");
  const verdict = (VERDICT_LABEL[item.checks[0]?.verdict ?? ""] ?? "").toLowerCase();
  const head = reads === "request"
    ? `Firewall checks your message: ${verdict}`
    : reads === "document"
      ? !protectedRun ? `Agent reads the ${noun}, unchecked` : item.read ? `Agent reads the ${noun}: ${verdict}` : `Firewall checking the ${noun}`
      : !protectedRun
        ? `Agent reads the inbox: ${n} email${n === 1 ? "" : "s"}, none checked`
        : item.read
          ? `Agent reads the inbox: ${n} email${n === 1 ? "" : "s"}, ${tally}`
          : `Firewall checking the inbox: ${item.checks.length} of ${n} checked`;
  const flagged = item.checks.find((c) => c.verdict !== "allow");
  const dot = protectedRun ? verdictColour(flagged?.verdict ?? "allow") : "var(--ink-400)";
  const tool = reads === "inbox" ? "read_inbox" : reads === "document" ? "read_document" : null;
  const what = reads === "inbox" ? "email" : noun; // what one row's check read

  return (
    <li data-event className={r.event} style={{ "--dot": dot } as React.CSSProperties}>
      {protectedRun
        ? <span className={r.kind}><strong>Prompt firewall</strong> · checkpoint 1{tool && toolN !== null && <> · then tool call {toolN} <span className={r.code}>{tool}</span></>}</span>
        : tool && toolN !== null && <ToolTag name={tool} n={toolN} />}
      <div>{head}</div>
      {protectedRun && <div className="small muted">{CHECKPOINT_1} Each row shows what it did, step by step.</div>}
      <ul className={r.inboxRows}>
        {emails.map((e, i) => {
          const c = item.checks.find((x) => x.email_id === String(i + 1));
          return (
            <li key={i} data-row data-verdict={c?.verdict ?? ""} className={r.inboxRow}>
              <span className={r.rowIndex}>{i + 1}</span>
              <span className={r.rowSubject}>{e.subject || "(no subject)"}</span>
              {protectedRun
                ? c
                  ? <strong style={{ color: verdictColour(c.verdict) }}>{VERDICT_LABEL[c.verdict ?? ""] ?? c.verdict}</strong>
                  : <span className="muted">waiting</span>
                : <span className="muted">not checked</span>}
              {c?.layers?.trace && (
                <div className={r.rowDetail}>
                  <LayerTrack layers={c.layers} lane={c.lane} noun={what} ownMessage={reads === "request"} caption={false} />
                  <CheckStory layers={c.layers} lane={c.lane} verdict={c.verdict} cuts={c.removed?.length ?? 0} noun={what}
                    ocr={noun === "image"} ownMessage={reads === "request"} usage={Array.isArray(c.usage) ? c.usage : []} />
                </div>
              )}
              {c?.types && c.types.length > 0 && <span className={`${r.rowDetail} muted`}>Attack types the firewall named: {c.types.map(pretty).join(", ")}</span>}
              {c?.removed?.map((text, k) => <span key={k} data-wipe className={`${r.rowDetail} ${r.removedLine}`}>{text}</span>)}
              {c?.warnings && c.warnings.length > 0 && <span className={`${r.rowDetail} ${s.warn}`}>{c.warnings.join(" · ")}</span>}
              {!protectedRun && !custom && e.attack && (
                <span className={r.rowDetail} style={{ color: "var(--block)" }}>Contains a hidden instruction, which reaches the agent as written</span>
              )}
            </li>
          );
        })}
      </ul>
    </li>
  );
}

function Event({ step, protectedRun, unsafe, noun, took, n }: {
  step: Step; protectedRun: boolean; unsafe: (action: Step) => string | null; noun: string; took: number | null; n: number;
}) {
  if (step.step === "model") {
    const asks = decisions(step, noun);
    return (
      <li data-event className={r.event}>
        {step.usage && !Array.isArray(step.usage) && <CallTag usage={step.usage} took={took} n={n} />}
        <div>Agent {asks.length ? <>decides to {asks.join(", then ")}</> : "writes the reply to you"}</div>
        {step.reasoning && (
          <details className={s.disclosure}>
            <summary>Its reasoning</summary>
            <div className={r.reasoning}>{step.reasoning}</div>
          </details>
        )}
      </li>
    );
  }
  if (READ_ONLY.has(step.name ?? "")) {
    return (
      <li data-event className={r.event}>
        <ToolTag name={step.name} n={n} />
        <div className="muted">Ran: it only reads, so it is always allowed</div>
        <Returned result={step.result} />
      </li>
    );
  }

  const blocked = step.guard?.decision === "block";
  const why = !protectedRun ? unsafe(step) : null;
  // The moments the demo is about: an action the guard blocked, and an unsafe one that ran unchecked
  if (blocked || why) {
    return (
      <li data-event className={r.event} style={{ "--dot": "var(--block)" } as React.CSSProperties}>
        <ToolTag name={step.name} n={n} />
        <div data-stamp className={r.alertBox}>
          <span className={r.alertHead}>
            <StatusIcon kind={blocked ? "blocked" : "unsafe"} />
            {blocked ? "Blocked by the action guard" : "Ran unchecked"}
          </span>
          <Args args={step.args} struck={blocked} />
          <div className={r.eventDetail}>
            {blocked ? <>{step.guard?.reason}{step.guard?.types.length ? ` · ${step.guard.types.map(pretty).join(", ")}` : ""}. It never ran.</> : why}
          </div>
        </div>
        <Returned result={step.result} />
      </li>
    );
  }
  return (
    <li data-event className={r.event} style={{ "--dot": "var(--ink-900)" } as React.CSSProperties}>
      <ToolTag name={step.name} n={n} />
      <div><strong>Ran</strong>{protectedRun && step.guard && <span className="muted">: the action guard allowed it ({step.guard.reason})</span>}</div>
      <Args args={step.args} />
      <Returned result={step.result} />
    </li>
  );
}

const clock = (sec: number) => (sec < 60 ? `${sec} s` : `${Math.floor(sec / 60)} min ${String(sec % 60).padStart(2, "0")} s`);

interface Props {
  jobs: Partial<Record<ModeKey, Job>>;
  seconds: Partial<Record<ModeKey, number>>;
  scenario: Scenario | null;
  custom: boolean;
  emails: Email[]; // the inbox as it was when the run started; for a document or a message, one row naming it
  reads?: Reads;
  noun?: string; // what the agents read, for a document or a message: "web page", "PDF", "message" …
}

// A short flash of the verdict colour when an inbox row gets its result
const FLASH: Record<string, string> = { allow: "#c9ecd6", sanitise: "#fbe3b5", quarantine: "#f8c9c5" };

export default function RunResults({ jobs, seconds, scenario, custom, emails, reads = "inbox", noun = "email" }: Props) {
  const root = useRef<HTMLDivElement>(null);

  // Runs after every poll: animates only what is new since the last render, marking it as shown.
  useGSAP(() => {
    const el = root.current;
    if (!el) return;
    const fresh = (selector: string) => {
      const found = [...el.querySelectorAll<HTMLElement>(`${selector}:not([data-shown])`)];
      found.forEach((n) => { n.dataset.shown = ""; });
      return found;
    };
    const lanes = fresh("[data-lane]");
    if (lanes.length) gsap.from(lanes, { y: 32, autoAlpha: 0, duration: duration(0.7), ease: "expo.out", stagger: 0.1, delay: duration(0.25) });
    const events = fresh("[data-event]");
    if (events.length) gsap.from(events, { y: 10, autoAlpha: 0, duration: duration(0.45), ease: "power2.out", stagger: { amount: Math.min(0.6, events.length * 0.06) } });
    const rows = fresh("[data-row]");
    if (rows.length) gsap.from(rows, { x: -8, autoAlpha: 0, duration: duration(0.35), ease: "power2.out", stagger: 0.05 });
    const pops = fresh("[data-pop]");
    if (pops.length) gsap.from(pops, { scale: 0.94, autoAlpha: 0, duration: duration(0.6), ease: "back.out(1.7)" });
    // A blocked or unsafe action lands like a stamp, once, so the eye goes to it
    const stamps = fresh("[data-stamp]");
    if (stamps.length) gsap.from(stamps, { scale: 1.08, autoAlpha: 0, duration: duration(0.5), ease: "back.out(2.2)", delay: duration(0.2) });
    const wipes = fresh("[data-wipe]");
    if (wipes.length) {
      gsap.fromTo(wipes, { clipPath: "inset(0 100% 0 0)" },
        { clipPath: "inset(0 0% 0 0)", duration: duration(0.8), ease: "power2.inOut", stagger: 0.15, delay: duration(0.15) });
    }
    el.querySelectorAll<HTMLElement>("[data-verdict]").forEach((row) => {
      const v = row.dataset.verdict ?? "";
      if (!FLASH[v] || row.dataset.flashed === v) return;
      row.dataset.flashed = v;
      gsap.fromTo(row, { backgroundColor: FLASH[v] }, { backgroundColor: "#f8f8f6", duration: duration(1.2), ease: "power2.out", clearProps: "backgroundColor" });
    });
  }, { dependencies: [jobs], scope: root });

  const unsafe = unsafeReason(jobs, scenario, custom);

  return (
    <div ref={root} className={s.results}>
      {MODES.map((m) => {
        const job = jobs[m.key];
        if (!job) return null;
        const protectedRun = m.key === "protected";
        const o = job.status === "done" ? outcome(job, scenario, custom, protectedRun, protectedRun ? undefined : jobs.protected) : null;
        const items = group(job.steps, reads);
        // AI model calls and tool calls are numbered separately ("AI model call 3", "tool call 2"), matching the checklist's counts
        let models = 0, tools = 0;
        const numbered = items.map((it) => ({ it, n: it.kind === "inbox" ? (it.read ? ++tools : null)
          : it.step.step === "model" ? ++models : it.step.step === "tool" ? ++tools : null }));
        // How long each step took: from the end of the step before it (the demo agent stamps when each one finished)
        const took = new Map<Step, number>();
        job.steps.reduce((prev, st) => { if (st.at_ms === undefined) return prev; took.set(st, st.at_ms - prev); return st.at_ms; }, 0);
        const readInbox = items.some((it) => it.kind === "inbox" && it.read);
        return (
          <section key={m.key} data-lane className={`card ${r.lane}`} aria-live="polite">
            <header className={r.laneHead}>
              <div>
                <h3 className={r.laneTitle}>{m.label}</h3>
                <p className="small muted">{hint(m.key, reads, noun)}</p>
              </div>
              <span className={r.laneTime}>{clock(seconds[m.key] ?? 0)}</span>
            </header>

            {o && (
              <div data-pop className={`${r.outcome} ${TONE[o.tone]}`}>
                <strong className={r.outcomeTitle}>{o.icon && <StatusIcon kind={o.icon} size={28} />}{o.title}</strong>
                {o.detail && <p>{o.detail}</p>}
              </div>
            )}
            {job.status === "error" && <div className={s.error}>The run failed: {job.error}</div>}
            <Pipeline job={job} emails={emails} protectedRun={protectedRun} reads={reads} noun={noun} unsafe={(st) => unsafe(st) !== null} />

            {job.steps.length > 0 && (
              <ol className={r.timeline}>
                {numbered.map(({ it, n }, i) => it.kind === "inbox"
                  ? <InboxEvent key={i} item={it} emails={emails} protectedRun={protectedRun} custom={custom} reads={reads} noun={noun} toolN={n} />
                  : <Event key={i} step={it.step} protectedRun={protectedRun} unsafe={unsafe} noun={noun} took={took.get(it.step) ?? null} n={n ?? 0} />)}
              </ol>
            )}

            {job.result?.answer && (
              <div>
                <span className="label">The agent&apos;s reply</span>
                {readInbox && reads === "inbox" && <p className="small muted" style={{ marginBottom: "var(--space-2)" }}>One answer, written after reading all {emails.length} emails.</p>}
                <div className={r.answer}><Markdown text={job.result.answer} /></div>
              </div>
            )}

            {job.steps.length > 0 && (
              <CostTable usage={runUsage(job.steps)} detectors={protectedRun} running={job.status === "running"} reads={reads} noun={noun} />
            )}
          </section>
        );
      })}
    </div>
  );
}
