import React from "react";
import type { Usage } from "@/lib/demo-types";
import { elapsed } from "@/lib/run-audit";
import { formatCost, MODEL_NAME } from "./CostTable";
import r from "./run.module.css";

const num = (n: number) => n.toLocaleString("en-US");
const WHO: Record<Usage["role"], string> = { agent: "Agent", judge: "Firewall judge", sandbox: "Firewall sandbox" };

// An AI model call in one quiet line: who, which model, how long, what it cost (tokens on hover)
export default function CallTag({ usage, took, n }: { usage: Usage; took: number | null; n?: number }) {
  return (
    <span className={r.kind} title={`${num(usage.input_tokens)} tokens in · ${num(usage.output_tokens)} out`}>
      <strong>AI model call{n !== undefined && ` ${n}`}</strong> · {WHO[usage.role] ?? usage.role} · {MODEL_NAME[usage.model] ?? usage.model}
      {usage.calls > 1 && ` · ${usage.calls} calls`}{took !== null && ` · ${elapsed(took)}`}
      {` · ${formatCost(usage.cost_usd, usage.pricing === "estimated")}`}
    </span>
  );
}
