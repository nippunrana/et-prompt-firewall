// Every agent run, both lanes, kept in this browser's localStorage only: the full run (text included) never
// goes to a shared log, so no visitor sees another's. The firewall's own server log keeps decisions, never text.
import type { Email, Job, Reads, Scenario } from "./demo-types";

export type Lane = "unprotected" | "protected";

export interface RunRecord {
  id: string;
  started: string; // ISO time
  finished: string | null; // set once both lanes have ended
  title: string; // the scenario, "Your own inbox", or the document's name
  reads: Reads;
  noun: string;
  request: string; // what the user asked the agent
  scenario: Scenario | null;
  custom: boolean;
  emails: Email[]; // as RunResults takes them: the inbox, or one row naming the document
  jobs: Partial<Record<Lane, Job>>;
  seconds: Partial<Record<Lane, number>>;
}

export type RunMeta = Omit<RunRecord, "id" | "started" | "finished" | "jobs" | "seconds">;

// egnitech.com serves WordPress and other apps on the same origin, so the key is namespaced and the quota shared
const KEY = "et-prompt-firewall:runs";
const MAX = 50;
export const HISTORY_EVENT = "et-runs-changed";

// Runs started since this page loaded. An unfinished run that is not one of them was cut off by a reload or a closed tab.
const live = new Set<string>();
export const interrupted = (run: RunRecord) => !run.finished && !live.has(run.id);

export function loadRuns(): RunRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function write(runs: RunRecord[]) {
  // Full storage drops the oldest runs until the newest fits; history is never worth failing a run over
  for (let keep = runs.length; keep > 0; keep--) {
    try {
      localStorage.setItem(KEY, JSON.stringify(runs.slice(0, keep)));
      break;
    } catch { /* quota exceeded: try with one run fewer */ }
  }
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

// A finished job as stored: the demo agent's result repeats every step, which would double each record
export const recordable = (job: Job): Job => ({
  status: job.status, steps: job.steps, error: job.error,
  result: job.result && { answer: job.result.answer, effects: job.result.effects, canary: job.result.canary },
});

export function beginRun(meta: RunMeta): RunRecord {
  // Not crypto.randomUUID: it exists only on HTTPS and localhost, and the stack also runs over plain HTTP
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const run: RunRecord = { ...meta, id, started: new Date().toISOString(), finished: null, jobs: {}, seconds: {} };
  live.add(run.id);
  saveRun(run);
  return run;
}

// Newest first; replaces the stored copy of the same run
export function saveRun(run: RunRecord) {
  write([run, ...loadRuns().filter((r) => r.id !== run.id)].slice(0, MAX));
}

export function clearRuns() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(HISTORY_EVENT));
}
