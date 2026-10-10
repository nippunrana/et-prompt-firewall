// The run as a checklist, from what has really happened: the job's steps and the firewall's stage events
// (/check/stream, relayed by the demo agent). A row is ticked only once its step or event has arrived;
// "running" means the step before it finished, so the graph has moved on to it.
import { pretty, VERDICT_LABEL, type Email, type Job, type Reads, type StageEvent, type Step } from "./demo-types";

// done: finished · flag: finished and raised a signal · running · pending · skip: not needed, by design
// off: not there (no firewall, no API key, or it failed)
export type RowState = "done" | "flag" | "running" | "pending" | "skip" | "off";

export interface Row {
  key: string;
  name: string;
  value?: string;
  state: RowState;
}

export interface PipeItem extends Row {
  checkpoint?: 1 | 2;
  rows?: Row[]; // the firewall's stages for the email being checked, or each action the guard checked
  rowsKey?: string; // changes when the rows start over (the next email), so their ticks replay from the top
}

export const READ_ONLY = new Set(["read_inbox", "read_document", "list_invoices", "search_contacts"]);

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const target = (args?: Record<string, string>) => args?.to || args?.recipient || "";

// The firewall's stages, in the order its graph runs them (services/firewall/app/check.py)
export const STAGES: [string, string][] = [
  ["prepare", "Clean up the text"],
  ["rules", "Pattern rules"],
  ["classifiers", "PIGuard + Prompt Guard 2"],
  ["lid", "Language check"],
  ["triage", "Triage"],
  ["judge", "LLM judge"],
  ["sandbox", "Sandbox with fake tools"],
  ["decide", "Decide"],
  ["recheck", "Cut and re-check"],
];

const LANE: Record<string, string> = { clean: "nothing suspicious", clear_attack: "clear attack", unsure: "unsure: ask the AI layers" };

function finished(key: string, e: StageEvent, all: StageEvent[]): Pick<Row, "value" | "state"> {
  switch (key) {
    case "prepare":
      return { value: `${plural(Number(e.units ?? 0), "sentence")}, hidden characters unpacked`, state: "done" };
    case "rules": {
      const hits = Number(e.hits ?? 0);
      return hits ? { value: plural(hits, "match", "matches"), state: "flag" } : { value: "no match", state: "done" };
    }
    case "classifiers":
      if (e.failed || !e.scores) return { value: "failed: decided on the rules", state: "off" };
      return { value: Object.entries(e.scores).map(([name, sc]) => `${name} ${Math.max(sc.whole, sc.max_window).toFixed(2)}`).join(" · "), state: "done" };
    case "lid":
      return e.non_english ? { value: "non-English found", state: "flag" } : { value: "English only", state: "done" };
    case "triage":
      return { value: LANE[String(e.lane)] ?? pretty(String(e.lane)), state: e.lane === "clean" ? "done" : "flag" };
    case "judge":
      if (!e.ok) return { value: "failed", state: "off" };
      if (e.took_over) return { value: "taken over by the email", state: "flag" };
      return e.attack ? { value: "attack", state: "flag" } : { value: "safe", state: "done" };
    case "sandbox": {
      const calls = (e.calls as string[] | undefined) ?? [];
      if (!e.ok) return { value: "failed", state: "off" };
      return e.acted ? { value: `tried ${pretty(calls.find((c) => !READ_ONLY.has(c)) ?? calls[0] ?? "a tool")}`, state: "flag" }
        : { value: "no action", state: "done" };
    }
    case "decide": {
      const verdict = String(e.verdict);
      return { value: verdict === "sanitise" ? `cut ${plural(Number(e.cuts ?? 0), "part")}` : (VERDICT_LABEL[verdict] ?? verdict).toLowerCase(), state: "done" };
    }
    default: { // recheck: the last round decides
      const rounds = all.filter((x) => x.step === "recheck");
      const last = rounds[rounds.length - 1];
      return Number(last.left ?? 0) > 0 && !last.widened ? { value: "still flagged: blocked", state: "flag" }
        : { value: rounds.length > 1 ? `clean after ${rounds.length} rounds` : "clean", state: "done" };
    }
  }
}

export function stageRows(events: StageEvent[]): Row[] {
  const last = (key: string) => [...events].reverse().find((e) => e.step === key);
  const triage = last("triage"), decide = last("decide"), recheck = last("recheck");
  let reached = false; // the first unfinished stage is the one running now
  return STAGES.map(([key, name]): Row => {
    const e = last(key);
    if (e && !(key === "recheck" && e.widened)) return { key, name, ...finished(key, e, events) };
    if ((key === "judge" || key === "sandbox") && triage) {
      if (triage.lane === "clean") return { key, name, value: "not needed", state: "skip" };
      if (decide) return { key, name, value: "unavailable on this server", state: "off" };
      reached = true;
      return { key, name, state: "running" }; // the two run side by side
    }
    if (key === "recheck" && decide && decide.verdict !== "sanitise") return { key, name, value: "nothing to cut", state: "skip" };
    if (key === "recheck" && recheck?.widened) return { key, name, value: "widening the cut", state: "running" };
    if (reached) return { key, name, state: "pending" };
    reached = true;
    return { key, name, state: "running" };
  });
}

function firewallItem(job: Job, emails: Email[], asked: boolean, read: boolean, reads: Reads, noun: string): PipeItem {
  const checks = job.steps.filter((s) => s.step === "firewall");
  const n = emails.length;
  const inbox = reads === "inbox";
  const base = { key: "content", name: inbox ? "Prompt firewall checks each email" : `Prompt firewall checks the ${noun}`, checkpoint: 1 as const };
  if (read || checks.length === n) {
    const counts: Record<string, number> = {};
    checks.forEach((c) => { counts[c.verdict ?? ""] = (counts[c.verdict ?? ""] ?? 0) + 1; });
    const tally = Object.entries(counts).map(([v, k]) => `${k} ${(VERDICT_LABEL[v] ?? v).toLowerCase()}`).join(", ");
    const value = inbox ? `${plural(checks.length, "email")} checked: ${tally}` : (VERDICT_LABEL[checks[0]?.verdict ?? ""] ?? "").toLowerCase();
    return { ...base, value, state: counts.allow === checks.length ? "done" : "flag" };
  }
  if (!asked) return { ...base, value: job.status === "running" ? undefined : `the agent never read the ${inbox ? "inbox" : noun}`, state: job.status === "running" ? "pending" : "skip" };
  const current = String(checks.length + 1);
  const live = job.live?.email_id === current ? job.live.stages : [];
  const subject = emails[checks.length]?.subject || "(no subject)";
  return { ...base, value: inbox ? `email ${current} of ${n}: ${subject}` : `checking the ${noun}`, state: "running", rows: stageRows(live), rowsKey: current };
}

function guardItem(job: Job, protectedRun: boolean): PipeItem {
  const actions = job.steps.filter((s): s is Step & { name: string } => s.step === "tool" && !READ_ONLY.has(s.name ?? ""));
  const base = { key: "guard", name: protectedRun ? "Action guard checks each action" : "No action guard", checkpoint: 2 as const };
  const rows = actions.map((a, i): Row => {
    const blocked = a.guard?.decision === "block";
    return { key: `a${i}`, name: `${pretty(a.name)}${target(a.args) ? ` → ${target(a.args)}` : ""}`,
      value: !protectedRun ? "ran unchecked" : blocked ? "blocked" : "allowed", state: blocked || !protectedRun ? "flag" : "done" };
  });
  if (!protectedRun) return { ...base, value: actions.length ? "every action runs as the agent asks" : "every action would run unchecked", state: "off", rows };
  const blocked = rows.filter((r) => r.state === "flag").length;
  if (job.status === "running") return { ...base, value: actions.length ? `${plural(actions.length, "action")} checked so far` : "waits for the agent's actions", state: actions.length ? "running" : "pending", rows };
  if (!actions.length) return { ...base, value: "the agent took no outgoing action", state: "skip" };
  return { ...base, value: `${plural(actions.length, "action")} checked, ${blocked} blocked`, state: blocked ? "flag" : "done", rows };
}

// The run in five steps, the two checkpoints between them. `reads` is what the agents read (the inbox, a shared
// document, or the request itself), `noun` its name. The inbox is read when the agent asks for it; a document
// (read up front, like an attachment) and a request are checked before the agent's first turn.
export function pipeline(job: Job, emails: Email[], protectedRun: boolean, reads: Reads = "inbox", noun = "email"): PipeItem[] {
  const models = job.steps.filter((s) => s.step === "model");
  const tool = reads === "inbox" ? "read_inbox" : "read_document";
  const asked = reads !== "inbox" || models.some((m) => m.tool_calls?.some((c) => c.name === tool));
  const read = reads === "request" ? !protectedRun || job.steps.some((s) => s.step === "firewall")
    : job.steps.some((s) => s.step === "tool" && s.name === tool);
  const running = job.status === "running";
  const first = models[0];

  const request: PipeItem = first
    ? { key: "request", name: "Agent reads your request", value: first.tool_calls?.length ? `decides to call ${first.tool_calls.map((c) => c.name).join(", ")}` : "answers without tools", state: "done" }
    : reads === "request" && job.status === "done"
      ? { key: "request", name: "Agent reads your request", value: "never reached the agent", state: "skip" }
      : { key: "request", name: "Agent reads your request", state: running ? (reads === "inbox" || read ? "running" : "pending") : "off" };

  const unchecked = reads === "inbox" ? "every email" : reads === "request" ? "your message" : `the ${noun}`;
  const content: PipeItem = protectedRun ? firewallItem(job, emails, asked, read, reads, noun)
    : { key: "content", name: "No prompt firewall", value: `the agent reads ${unchecked} as it is`, state: "off", checkpoint: 1 };

  const acting = !first ? (job.status === "done" ? "skip" : "pending") : running ? (read || !asked ? "running" : "pending") : "done";
  const work: PipeItem = { key: "work", name: "Agent works on the task", state: job.status === "error" ? "off" : acting,
    value: acting === "done" ? plural(models.length, "decision") : undefined };

  const reply: PipeItem = job.result?.answer ? { key: "reply", name: "Agent replies", value: "below", state: "done" }
    : job.status === "done" ? { key: "reply", name: "Agent replies", value: "it finished without writing a reply", state: "skip" }
    : { key: "reply", name: "Agent replies", value: job.status === "error" ? "the run failed" : undefined, state: job.status === "error" ? "off" : "pending" };

  return reads === "inbox" ? [request, content, work, guardItem(job, protectedRun), reply]
    : [content, request, work, guardItem(job, protectedRun), reply];
}
