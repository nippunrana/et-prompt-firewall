import React from "react";
import { elapsed, modelCalls } from "@/lib/run-audit";
import type { Lane, RunRecord } from "@/lib/run-history";
import { formatCost, MODEL_NAME } from "./CostTable";
import a from "./audit.module.css";

const WHO = { agent: "Agent", judge: "Firewall judge", sandbox: "Firewall sandbox" };
const num = (n: number) => n.toLocaleString("en-US");

// A lane's model calls one by one, in the order they happened: who called which model, what for, and what it cost.
// Folded by default, so the lane's outcome stays the first thing read.
export default function ModelCalls({ run, lane }: { run: RunRecord; lane: Lane }) {
  const calls = modelCalls(run, lane);
  if (!calls.length) return null;
  const total = calls.reduce((n, c) => n + c.usage.calls, 0);

  return (
    <details className={a.calls}>
      <summary>See the {total} model call{total === 1 ? "" : "s"}, in order</summary>
      <ol className={a.callList}>
        {calls.map((c, i) => (
          <li key={i} className={a.call}>
            <span className={`${a.callIndex} num`}>{i + 1}</span>
            <div className={a.callBody}>
              <div className={a.callHead}>
                <strong>{WHO[c.usage.role] ?? c.usage.role}</strong>
                <span className="muted">
                  {MODEL_NAME[c.usage.model] ?? c.usage.model}{c.usage.calls > 1 ? ` · ${c.usage.calls} calls` : ""}
                </span>
              </div>
              <p>{c.purpose}</p>
              <p className={`${a.callMeta} muted num`}>
                {c.took !== null && `${elapsed(c.took)} · `}
                {num(c.usage.input_tokens)} in · {num(c.usage.output_tokens)} out
                {c.usage.reasoning_tokens > 0 && ` (${num(c.usage.reasoning_tokens)} thinking)`}
                {" · "}{formatCost(c.usage.cost_usd, c.usage.pricing === "estimated")}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
