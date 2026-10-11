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

  return (
    <div className={s.scope}>
      <span className={s.scopeLabel}>AI checks on</span>
      <div className={s.segmented} role="radiogroup" aria-label="When the AI judge and sandbox run">
        {MODES.map((x) => (
          <button key={x.key} role="radio" aria-checked={mode === x.key} title={x.title} className={s.segment}
            onClick={() => setLlmMode(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}
