// Shapes returned by the demo agent (/runs, /scenarios) and the firewall (/check).

export interface Email {
  from: string;
  subject: string;
  body: string;
  attack?: boolean;
}

// An inbox row in the editor: `key` keeps React state attached while emails are added and removed.
export interface InboxEmail extends Email {
  key: string;
  added?: string; // set when the tester added it: "blank" or the example's label
}

export interface Scenario {
  id: string;
  title: string;
  kind: "attack" | "phishing" | "task";
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
  types?: string[];
  removed?: string[];
  warnings?: string[];
  usage?: Usage[] | Usage | null; // firewall: the check's model calls; model: the agent's own call
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

export interface Job {
  status: "running" | "done" | "error";
  steps: Step[];
  result: { answer: string; effects: Effect[] } | null;
  error: string | null;
}

export interface Attack {
  types: string[];
  channel: string;
  span: [number, number];
  text: string;
  found_by: string[];
  confidence: string;
  rules: string[];
}

export interface CheckResult {
  verdict: "allow" | "sanitise" | "quarantine";
  lane: string;
  risk: number | null;
  attacks: Attack[];
  hints: { rule: string; type: string; text: string }[];
  warnings: string[];
  clean_content: string | null;
  scores: Record<string, { whole: number; max_window: number }>;
  trace: { step: string; ms: number }[];
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
