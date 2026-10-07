import React from "react";
import type { Step, Usage } from "@/lib/demo-types";
import c from "./cost.module.css";

// What each model does, in plain words
const ROLE: Record<Usage["role"], { name: string; task: string }> = {
  agent: { name: "Email agent", task: "Reads the inbox, decides what to do, writes the reply" },
  judge: { name: "Firewall judge", task: "Reads a flagged email and names the attack" },
  sandbox: { name: "Firewall sandbox", task: "A gullible copy of the agent: if it acts on the email, the email holds an instruction" },
};

const MODEL_NAME: Record<string, string> = {
  "qwen/qwen3-next-80b-a3b-thinking": "Qwen3-Next-80B Thinking",
  "gemma-4-31b-it": "Gemma 4 31B",
};

const num = (n: number) => n.toLocaleString("en-US");

// "≈" marks a cost worked out from token counts and a list price rather than reported by the provider
export function formatCost(usd: number | null, estimated = false) {
  if (usd === null) return "not reported";
  const approx = estimated ? "≈ " : "";
  if (usd === 0) return "$0";
  if (usd < 0.0001) return `${approx}< $0.0001`;
  return `${approx}$${usd.toFixed(4)}`;
}

// Every model call in a run: the agent's own turns and the firewall's calls for each email
export function runUsage(steps: Step[]): Usage[] {
  return steps.flatMap((st) => (Array.isArray(st.usage) ? st.usage : st.usage ? [st.usage] : []));
}

// One row per role and model, with calls, tokens and cost added up
function merge(entries: Usage[]): Usage[] {
  const rows = new Map<string, Usage>();
  for (const e of entries) {
    const key = `${e.role}|${e.model}`;
    const row = rows.get(key);
    if (!row) { rows.set(key, { ...e }); continue; }
    row.calls += e.calls;
    row.input_tokens += e.input_tokens;
    row.output_tokens += e.output_tokens;
    row.reasoning_tokens += e.reasoning_tokens;
    row.cost_usd = row.cost_usd === null || e.cost_usd === null ? null : row.cost_usd + e.cost_usd;
  }
  return [...rows.values()];
}

export default function CostTable({ usage, detectors, running }: { usage: Usage[]; detectors: boolean; running?: boolean }) {
  const rows = merge(usage);
  const known = rows.filter((r) => r.cost_usd !== null);
  const total = known.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);

  return (
    <div className={c.wrap}>
      <div className={c.head}>
        <span className="label">Models and cost{running ? " so far" : ""}</span>
        <span className={c.total}>{formatCost(total, rows.some((r) => r.pricing === "estimated"))}</span>
      </div>
      <ul className={c.rows}>
        {rows.map((r) => (
          <li key={`${r.role}|${r.model}`} className={c.row}>
            <div className={c.who}>
              <strong>{ROLE[r.role]?.name ?? r.role}</strong>
              <span className="muted">{ROLE[r.role]?.task}</span>
            </div>
            <div className={c.model}>
              {MODEL_NAME[r.model] ?? r.model}
              <span className="muted"> · {r.via}{r.provider && r.via !== "Gemini API" ? ` (${r.provider})` : ""}</span>
            </div>
            <div className={`${c.tokens} muted`}>
              {r.calls} call{r.calls === 1 ? "" : "s"} · {num(r.input_tokens)} in · {num(r.output_tokens)} out
              {r.reasoning_tokens > 0 && <> ({num(r.reasoning_tokens)} thinking)</>}
            </div>
            <div className={c.cost}>{formatCost(r.cost_usd, r.pricing === "estimated")}</div>
          </li>
        ))}
        {detectors && (
          <li className={c.row}>
            <div className={c.who}>
              <strong>Firewall detectors</strong>
              <span className="muted">Rules, PIGuard, Prompt Guard 2 and GlotLID check every email first</span>
            </div>
            <div className={c.model}>Local models<span className="muted"> · on our own server</span></div>
            <div className={`${c.tokens} muted`}>No per-call charge</div>
            <div className={c.cost}>$0</div>
          </li>
        )}
      </ul>
      <p className={c.note}>
        Token counts are as each provider reported them. OpenRouter reports its own charge.
        {rows.some((r) => r.pricing === "estimated") &&
          " ≈ Gemma 4 is priced at OpenRouter's list price for the same model ($0.09 in, $0.34 out per million tokens); the Gemini API we call does not charge for it."}
      </p>
    </div>
  );
}
