// Every agent run, both lanes, as one record. Where it is saved is the visitor's choice: in this browser's localStorage
// (the default), so no one else sees it, or shared with everyone on the server (/api/records), text included.
import { BASE_PATH } from "./base-path";
import type { Email, Job, Reads, Scenario } from "./demo-types";

export type Lane = "unprotected" | "protected";
export type Scope = "local" | "public";

export interface RunRecord {
  id: string;
  scope: Scope; // where it is saved, chosen when the run started
  shareError?: string; // sharing failed, so it was saved in this browser instead
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

export type RunMeta = Omit<RunRecord, "id" | "scope" | "shareError" | "started" | "finished" | "jobs" | "seconds">;

// egnitech.com serves WordPress and other apps on the same origin, so the key is namespaced and the quota shared
const KEY = "et-prompt-firewall:runs";
const SCOPE_KEY = "et-prompt-firewall:save";
const MAX = 50;
export const HISTORY_EVENT = "et-runs-changed";

// Saving locally is the default: a run is shared only when the visitor has switched to "For everyone"
export function getScope(): Scope {
  try {
    return localStorage.getItem(SCOPE_KEY) === "public" ? "public" : "local";
  } catch {
    return "local";
  }
}

export function setScope(scope: Scope) {
  localStorage.setItem(SCOPE_KEY, scope);
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

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
  const run: RunRecord = { ...meta, id, scope: getScope(), started: new Date().toISOString(), finished: null, jobs: {}, seconds: {} };
  live.add(run.id);
  saveRun(run);
  return run;
}

// Newest first; replaces the stored copy of the same run. A shared run is sent once, when both lanes have ended;
// if sharing fails, the run is kept in this browser instead, so it is never lost.
export function saveRun(run: RunRecord) {
  if (run.scope === "local") return write([run, ...loadRuns().filter((r) => r.id !== run.id)].slice(0, MAX));
  if (!run.finished) return;
  fetch(`${BASE_PATH}/api/records`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(run) })
    .then(async (response) => {
      if (!response.ok) throw new Error((await response.json()).error || `HTTP ${response.status}`);
      window.dispatchEvent(new Event(HISTORY_EVENT));
    })
    .catch((e) => saveRun({ ...run, scope: "local", shareError: e instanceof Error ? e.message : "could not reach the server" }));
}

export async function loadShared(): Promise<RunRecord[]> {
  const data = await (await fetch(`${BASE_PATH}/api/records`)).json();
  if (data.error) throw new Error(data.error);
  return data.records;
}

export function clearRuns() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(HISTORY_EVENT));
}
