// Shapes returned by the demo agent (/runs, /scenarios) and the firewall (/check).

export interface Email {
  from: string;
  subject: string;
  body: string;
  attack?: boolean;
}

// What the two agents read: the inbox, one shared document, or (a pasted user message) the request itself
export type Reads = "inbox" | "document" | "request";

// An inbox row in the editor: `key` keeps React state attached while emails are added and removed.
export interface InboxEmail extends Email {
  key: string;
  added?: string; // set when the tester added it: "blank" or the example's label
}

export interface Scenario {
  id: string;
  title: string;
  kind: "attack" | "phishing" | "task";
  featured?: boolean; // one of the attack techniques that lead the demo
  technique?: string; // its label in the LLMail-Inject labels, for the share on the dashboard
  how: string; // one line on how the attack works
  attack_types: string[];
  marker: string | null; // the attacker's address: an action carrying it means the attack worked
  user_request: string;
  emails: Email[];
}

// Tokens and cost of one model's calls, as the provider reported them (services/firewall/app/usage.py)
export interface Usage {
  role: "agent" | "judge" | "sandbox";
  model: string;
  via: string;
  provider: string | null;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  cost_usd: number | null; // null: the provider did not report it
  pricing: "reported" | "estimated"; // estimated: provider token counts × a published list price
}

export interface Step {
  step: "firewall" | "model" | "tool";
  // firewall
  email_id?: string;
  verdict?: string;
  lane?: string;
  types?: string[];
  removed?: string[];
  warnings?: string[];
  usage?: Usage[] | Usage | null; // firewall: the check's model calls; model: the agent's own call
  layers?: Layers; // firewall: what each layer found (absent when the firewall could not be reached)
  // model
  reasoning?: string;
  content?: string;
  tool_calls?: { name: string; args: string }[];
  // tool
  name?: string;
  args?: Record<string, string>;
  guard?: { decision: string; reason: string; types: string[] } | null;
}

export interface Effect {
  tool: string;
  args: Record<string, string>;
}

// One firewall stage, reported by /check/stream the moment it finished: its trace entry, plus the
// classifiers' scores on their stage.
export interface StageEvent {
  step: string;
  ms: number;
  scores?: Record<string, { whole: number; max_window: number }>;
  [extra: string]: unknown;
}

export interface Job {
  status: "running" | "done" | "error";
  steps: Step[];
  result: { answer: string; effects: Effect[]; canary?: string } | null; // canary: the secret in the agent's prompt
  error: string | null;
  live?: { email_id: string; stages: StageEvent[] } | null; // the email the firewall is checking right now
}

export interface Attack {
  types: string[];
  channel: string;
  span: [number, number];
  text: string;
  found_by: string[];
  confidence: string;
  rules: string[];
  hidden_in?: string[]; // where a person could not see it: html_comment, pdf_white_text, docx_hidden_text …
}

// What each firewall layer found in one check: the part of /check's answer the layer track reads.
// The demo agent passes these fields through unchanged on each firewall step.
export interface Layers {
  scores: Record<string, { whole: number; max_window: number }>;
  attacks: Attack[];
  cleared: { span: [number, number]; text: string; found_by: string[] }[]; // flagged, then cleared by the judge
  hints: { rule: string; type: string; text: string }[];
  non_english_spans: { span: [number, number]; language: string; confidence: number; text: string }[];
  judge: { ok: boolean; error: string | null; took_over: boolean; is_attack: boolean; types: string[]; confidence: string | null; reason: string } | null;
  sandbox: { ok: boolean; error: string | null; acted: boolean; calls: { name: string; args: Record<string, string> }[] } | null;
  trace: ({ step: string; ms: number } & Record<string, unknown>)[];
}

export interface CheckResult extends Layers {
  verdict: "allow" | "sanitise" | "quarantine";
  lane: string;
  risk: number | null;
  warnings: string[];
  clean_content: string | null;
  usage?: Usage[];
}

export const pretty = (s: string) => s.replace(/_/g, " ");

// The exact text the demo agent sends to /check for each email (services/demo-agent/app/agent.py, email_text).
export const emailText = (e: Email) => `From: ${e.from}\nSubject: ${e.subject}\n\n${e.body}`;

export const VERDICT_LABEL: Record<string, string> = {
  allow: "Allowed",
  sanitise: "Cleaned",
  quarantine: "Blocked",
  block: "Blocked",
};
