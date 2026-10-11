"use client";

import React, { useEffect, useState } from "react";
import { getLlmMode, LLM_EVENT, setLlmMode, type LlmMode } from "@/lib/llm-mode";
import s from "./shell.module.css";

const MODES: { key: LlmMode; label: string; title: string }[] = [
  { key: "flagged", label: "Flagged text", title: "The AI judge and sandbox read only what the rules and classifiers flag. Faster and cheaper." },
  { key: "always", label: "Everything", title: "The AI judge and sandbox read every input, flagged or not. Slower and more model calls; on held-out tests it caught the public attacks the detectors missed, with no extra false alarms on real email (see the README)." },
];

// When the firewall's LLM layers run, for every check and agent run started from this browser. In the header, beside
// the save switch, so it is in view before a run.
export default function LlmModeSwitch() {
  const [mode, setMode] = useState<LlmMode>("flagged");

  useEffect(() => {
    const load = () => setMode(getLlmMode());
    load();
    window.addEventListener(LLM_EVENT, load);
    window.addEventListener("storage", load); // switched in another tab
    return () => {
      window.removeEventListener(LLM_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const current = MODES.find((x) => x.key === mode)!;
  return (
    <label className={s.scope}>
      <span className={s.scopeLabel}>AI checks on</span>
      <select className={s.select} value={mode} title={current.title} onChange={(e) => setLlmMode(e.target.value as LlmMode)}>
        {MODES.map((x) => <option key={x.key} value={x.key} title={x.title}>{x.label}</option>)}
      </select>
    </label>
  );
}
