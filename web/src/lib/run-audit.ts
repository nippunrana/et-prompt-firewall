// A recorded run read back for the audit log: each lane as timed segments, the facts worth reading first, and
// what ran or failed. Everything comes from the recorded steps; nothing is inferred beyond them.
import { pretty, VERDICT_LABEL, type Job, type Step, type Usage } from "./demo-types";
import { READ_ONLY, target, type RowState } from "./pipeline";
import { interrupted, type Lane, type RunRecord } from "./run-history";

export const LANE_LABEL: Record<Lane, string> = { unprotected: "Without prompt firewall", protected: "With prompt firewall" };

export const elapsed = (ms: number) => {
  const sec = ms / 1000;
  if (sec < 10) return `${sec.toFixed(1)} s`;
  if (sec < 60) return `${Math.round(sec)} s`;
  return `${Math.floor(sec / 60)} min ${String(Math.round(sec % 60)).padStart(2, "0")} s`;
};

// How long a lane took: its last step's server time, else the browser's clock (a lane that failed before any step)
export function laneMs(run: RunRecord, lane: Lane): number | null {
  const steps = run.jobs[lane]?.steps ?? [];
  const last = steps[steps.length - 1]?.at_ms;
  if (last !== undefined) return last;
  return run.seconds[lane] !== undefined ? run.seconds[lane]! * 1000 : null;
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const outgoing = (steps: Step[]) => steps.filter((st) => st.step === "tool" && !READ_ONLY.has(st.name ?? ""));
const checks = (job?: Job) => (job?.steps ?? []).filter((st) => st.step === "firewall");
const action = (st: Step) => `${pretty(st.name ?? "")}${target(st.args) ? ` → ${target(st.args)}` : ""}`;

export type SegmentKind = "check" | "model" | "read" | "action" | "blocked" | "unsafe";

export interface Segment {
  start: number; // ms after the run began
  end: number;
  kind: SegmentKind;
  verdict?: string; // a firewall check's verdict
  label: string;
  short: string; // for a narrow block
  detail: string;
}

// Each step spans from the end of the step before it to its own end: the agent's steps run one after another.
// `unsafe` says why an action that ran unchecked is known to be unsafe (RunResults' unsafeReason).
export function segments(run: RunRecord, lane: Lane, unsafe: (st: Step) => string | null): Segment[] {
  const job = run.jobs[lane];
  let prev = 0;
  return (job?.steps ?? []).filter((st) => st.at_ms !== undefined).map((st): Segment => {
    const start = prev, end = st.at_ms!;
    prev = end;
    const took = elapsed(end - start);
    if (st.step === "firewall") {
      const subject = run.reads === "inbox" ? run.emails[Number(st.email_id) - 1]?.subject : null;
      const name = run.reads === "inbox" ? `Email ${st.email_id}` : run.reads === "request" ? "Your message" : `The ${run.noun}`;
      const verdict = VERDICT_LABEL[st.verdict ?? ""] ?? st.verdict ?? "";
      const types = st.types?.length ? ` · ${st.types.map(pretty).join(", ")}` : "";
      return { start, end, kind: "check", verdict: st.verdict, label: `${name}: ${verdict.toLowerCase()}`, short: name,
        detail: `Firewall checked ${name.toLowerCase()}${subject ? ` (“${subject}”)` : ""} in ${took}: ${verdict.toLowerCase()}${types}.` };
    }
    if (st.step === "model") {
      const calls = st.tool_calls?.map((c) => c.name).join(", ");
      return { start, end, kind: "model", label: calls ? "Agent decides" : "Agent answers", short: "Agent",
        detail: calls ? `The agent thought for ${took}, then decided to call ${calls}.` : `The agent thought for ${took}, then wrote its reply.` };
    }
    if (READ_ONLY.has(st.name ?? "")) {
      return { start, end, kind: "read", label: `Reads ${pretty(st.name ?? "")}`, short: "", detail: `The agent read with ${st.name}: reading is always allowed.` };
    }
    if (st.guard?.decision === "block") {
      return { start, end, kind: "blocked", label: `Blocked: ${action(st)}`, short: "",
        detail: `The action guard blocked ${action(st)}: ${st.guard.reason}. It never ran.` };
    }
    const why = lane === "unprotected" ? unsafe(st) : null;
    if (why) return { start, end, kind: "unsafe", label: `Ran unchecked: ${action(st)}`, short: "", detail: `${action(st)} ran with no check. ${why}` };
    return { start, end, kind: "action", label: `Ran: ${action(st)}`, short: "",
      detail: st.guard ? `The action guard allowed ${action(st)}: ${st.guard.reason}.` : `${action(st)} ran with no check.` };
  });
}

const usage = (steps: Step[]): Usage[] => steps.flatMap((st) => (Array.isArray(st.usage) ? st.usage : st.usage ? [st.usage] : []));

// The few numbers that tell a lane's story, in reading order
export function facts(run: RunRecord, lane: Lane): [string, string][] {
  const job = run.jobs[lane];
  if (!job) return [];
  const ms = laneMs(run, lane);
  const out: [string, string][] = [["Time", ms !== null ? elapsed(ms) : "–"]];
  const checked = checks(job);
  if (lane === "protected") {
    const counts: Record<string, number> = {};
    checked.forEach((c) => { counts[c.verdict ?? ""] = (counts[c.verdict ?? ""] ?? 0) + 1; });
    out.push(["Content checks", checked.length
      ? Object.entries(counts).map(([v, k]) => `${k} ${(VERDICT_LABEL[v] ?? v).toLowerCase()}`).join(", ")
      : "none ran"]);
    const named = [...new Set([...checked.flatMap((c) => c.types ?? []), ...job.steps.flatMap((st) => st.guard?.types ?? [])])];
    out.push(["Attack types named", named.length ? named.map(pretty).join(", ") : "none"]);
  } else {
    out.push(["Content checks", "none: read as it is"]);
  }
  const actions = outgoing(job.steps);
  const blocked = actions.filter((a) => a.guard?.decision === "block").length;
  out.push(["Outgoing actions", actions.length ? `${actions.length - blocked} ran${lane === "protected" ? `, ${blocked} blocked` : ""}` : "none"]);
  const calls = usage(job.steps);
  const known = calls.filter((u) => u.cost_usd !== null);
  const cost = known.reduce((sum, u) => sum + (u.cost_usd ?? 0), 0);
  out.push(["Model calls", `${calls.reduce((n, u) => n + u.calls, 0)} · ${cost ? `${calls.some((u) => u.pricing === "estimated") ? "≈ " : ""}$${cost.toFixed(4)}` : "$0"}`]);
  const canary = job.result?.canary;
  if (canary && job.status === "done") out.push(["Confidential reference", (job.result?.answer ?? "").includes(canary) ? "leaked in the reply" : "kept"]);
  return out;
}

export interface HealthRow {
  state: RowState;
  text: string;
}

// What ran and what failed, and why. A layer skipped by design is never reported as a failure.
export function health(run: RunRecord): HealthRow[] {
  const rows: HealthRow[] = [];
  if (interrupted(run)) rows.push({ state: "off", text: "The page was closed or reloaded before this run ended, so only what had finished by then was recorded." });
  for (const lane of ["unprotected", "protected"] as const) {
    const job = run.jobs[lane];
    if (!job) continue;
    if (job.status === "error") rows.push({ state: "off", text: `${LANE_LABEL[lane]}: the run failed (${job.error}).` });
    else if (job.status === "done") rows.push({ state: "done", text: `${LANE_LABEL[lane]}: finished in ${elapsed(laneMs(run, lane) ?? 0)}.` });
  }

  const job = run.jobs.protected;
  const checked = checks(job);
  if (!job || job.status === "error" && !checked.length) return rows;
  const what = run.reads === "inbox" ? plural(checked.length, "email") : run.reads === "request" ? "your message" : `the ${run.noun}`;
  const unreachable = checked.filter((c) => c.warnings?.some((w) => w.startsWith("firewall unreachable")));
  if (unreachable.length) {
    rows.push({ state: "off", text: `The firewall could not be reached for ${plural(unreachable.length, "check")}, so that content was withheld from the agent (it fails closed).` });
  } else if (checked.length && !job.steps.some((st) => st.step === "model")) {
    rows.push({ state: "done", text: `The firewall checked ${what} and stopped it: the agent never ran.` });
  } else if (checked.length) {
    rows.push({ state: "done", text: `The firewall checked ${what} before the agent read ${checked.length === 1 ? "it" : "them"}.` });
  }
  const layers = checked.map((c) => ({ lane: c.lane, l: c.layers })).filter((x) => x.l);
  const classifiersFailed = layers.filter((x) => x.l!.trace.some((t) => t.step === "classifiers" && t.failed)).length;
  if (classifiersFailed) rows.push({ state: "off", text: `The classifiers failed on ${plural(classifiersFailed, "check")}; those were decided on the pattern rules.` });

  for (const [key, name] of [["judge", "LLM judge"], ["sandbox", "Sandbox"]] as const) {
    // The firewall never runs the sandbox on the user's own message: a request is meant to hold instructions
    if (key === "sandbox" && run.reads === "request") {
      rows.push({ state: "skip", text: "Sandbox not used on your own message, by design: a request is meant to hold instructions." });
      continue;
    }
    const ran = layers.filter((x) => x.l![key]);
    const failed = ran.filter((x) => !x.l![key]!.ok);
    const unavailable = layers.filter((x) => !x.l![key] && x.lane !== "clean").length;
    if (failed.length) rows.push({ state: "off", text: `${name} failed on ${plural(failed.length, "check")} (${failed[0].l![key]!.error ?? "no reason given"}), so the firewall decided without its vote.` });
    if (ran.length > failed.length) rows.push({ state: "done", text: `${name} answered on ${plural(ran.length - failed.length, "flagged check")}.` });
    if (unavailable) rows.push({ state: "off", text: `${name} unavailable on this server for ${plural(unavailable, "check")} (no API key).` });
  }
  const clean = layers.filter((x) => x.lane === "clean").length;
  if (clean) rows.push({ state: "skip", text: `Judge and sandbox not needed on ${plural(clean, "clean check")}: the rules and classifiers found nothing, so no LLM call was made.` });
  const other = [...new Set(checked.flatMap((c) => c.warnings ?? []).filter((w) => !w.startsWith("firewall unreachable")))];
  other.forEach((w) => rows.push({ state: "flag", text: `Firewall warning: ${w}.` }));

  const actions = outgoing(job.steps);
  const guardDown = actions.filter((a) => a.guard?.reason.includes("could not be reached")).length;
  if (guardDown) rows.push({ state: "off", text: `The action guard could not be reached for ${plural(guardDown, "action")}, so ${guardDown === 1 ? "it was" : "they were"} blocked (it fails closed).` });
  if (actions.length > guardDown) rows.push({ state: "done", text: `The action guard checked ${plural(actions.length - guardDown, "outgoing action")} before ${actions.length - guardDown === 1 ? "it" : "they"} could run.` });
  if (!actions.length && job.status === "done") rows.push({ state: "skip", text: "The action guard had nothing to check: the agent took no outgoing action." });
  return rows;
}

// What a tool call asks for, in plain words, from its name and arguments
function intent(name: string, args: Record<string, unknown>, noun: string): string {
  const a = (k: string) => (args[k] === undefined ? "" : String(args[k]));
  switch (name) {
    case "read_inbox": return "read the inbox";
    case "read_document": return `read the ${noun}`;
    case "list_invoices": return a("count") ? `list the latest ${a("count")} invoices` : "list the latest invoices";
    case "search_contacts": return `look up “${a("name")}” in the contacts`;
    case "read_file": return `read the file ${a("path")}`;
    case "send_email": return `send an email to ${a("to") || "someone"}`;
    case "forward_email": return `forward email ${a("email_id")} to ${a("to") || "someone"}`;
    case "reply_email": return `reply to email ${a("email_id")}`;
    case "make_payment": return `pay ${a("recipient") || "someone"}${a("amount") ? ` ${a("amount")}${a("currency") ? ` ${a("currency")}` : ""}` : ""}`;
    case "delete_email": return `delete email ${a("email_id")}`;
    case "delete_file": return `delete the file ${a("path")}`;
    case "run_shell_command": return `run the command ${a("command")}`;
    case "http_request": return `make a web request to ${a("url")}`;
    default: return `call ${name}`;
  }
}

const parse = (args: unknown): Record<string, unknown> => {
  if (args && typeof args === "object") return args as Record<string, unknown>;
  try {
    return JSON.parse(String(args ?? "{}")) ?? {};
  } catch {
    return {};
  }
};

// What an agent turn decided, in plain words: one entry per tool call it made ("list the latest 3 invoices")
export const decisions = (st: Step, noun: string) => (st.tool_calls ?? []).map((c) => intent(c.name, parse(c.args), noun));
