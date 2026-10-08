"use client";

import React, { useState } from "react";
import { pretty, VERDICT_LABEL, type Attack, type CheckResult } from "@/lib/demo-types";
import CostTable from "./CostTable";
import LayerTrack from "./LayerTrack";
import s from "./demo.module.css";

export interface CheckState {
  loading: boolean;
  error: string | null;
  result: CheckResult | null;
  text: string; // the exact text that was checked: the result's character offsets point into it
  ms: number;
}

const SUMMARY: Record<CheckResult["verdict"], (n: number, noun: string) => string> = {
  allow: (_, noun) => `Nothing to remove. The agent would read this ${noun} as written.`,
  sanitise: (n) => `Removed ${n} part${n === 1 ? "" : "s"}. The agent reads the cleaned version below.`,
  quarantine: (_, noun) => `Blocked. The ${noun} could not be cleaned safely, so the agent never sees it.`,
};

// Where a removed part was hidden from a person, in words
const HIDDEN: Record<string, string> = {
  html_comment: "an HTML comment", html_hidden: "a hidden page element", html_attribute: "image or meta text",
  pdf_white_text: "white text", pdf_tiny_text: "tiny text", pdf_off_page_text: "text placed off the page",
  docx_hidden_text: "text marked hidden", docx_white_text: "white text", docx_tiny_text: "tiny text",
  docx_comment: "a reviewer comment",
};
const hiddenIn = (a: Attack) => (a.hidden_in ?? []).map((k) => HIDDEN[k] ?? pretty(k));

// The checked text with every removed span marked, using the firewall's character offsets
function highlight(text: string, attacks: Attack[]) {
  const spans = [...attacks].sort((a, b) => a.span[0] - b.span[0]);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach((a, i) => {
    parts.push(text.slice(pos, a.span[0]));
    parts.push(<mark key={i} className="removed" title={a.types.map(pretty).join(", ")}>{text.slice(a.span[0], a.span[1])}</mark>);
    pos = a.span[1];
  });
  parts.push(text.slice(pos));
  return parts;
}

export default function EmailCheck({ state, noun = "email" }: { state: CheckState; noun?: string }) {
  const [showJson, setShowJson] = useState(false);

  if (state.loading) {
    return (
      <div className={s.check} aria-live="polite">
        <span className="small muted">Checking this {noun}… On the live server this can take up to a minute.</span>
        <div className={s.progress}><div className={`${s.progressBar} ${s.progressIndeterminate}`} /></div>
      </div>
    );
  }
  if (state.error) return <div className={s.error}>Check failed: {state.error}</div>;
  const r = state.result;
  if (!r) return null;
  const types = [...new Set(r.attacks.flatMap((a) => a.types))];

  return (
    <div className={s.check} aria-live="polite">
      <div className={s.checkRow}>
        <span className={`pill pill--${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
        {types.map((t) => <span key={t} className="tag">{pretty(t)}</span>)}
        <span className={s.checkTime}>{(state.ms / 1000).toFixed(1)} s</span>
      </div>
      <p className="small">{SUMMARY[r.verdict](r.attacks.length, noun)}</p>
      {r.attacks.some((a) => hiddenIn(a).length) && (
        <p className="small">
          <strong>Hidden from a person:</strong> {[...new Set(r.attacks.flatMap(hiddenIn))].join(", ")}. A reader would never
          see it; an AI reading the {noun} would.
        </p>
      )}
      {r.warnings.length > 0 && <p className={s.warn}>{r.warnings.join(" · ")}</p>}
      <LayerTrack layers={r} lane={r.lane} />

      {r.attacks.length > 0 && <pre className={s.textBlock}>{highlight(state.text, r.attacks)}</pre>}

      {r.clean_content !== null && r.verdict !== "allow" && (
        <details className={s.disclosure}>
          <summary>What the agent receives</summary>
          <pre className={s.textBlock}>{r.clean_content}</pre>
        </details>
      )}

      <CostTable usage={r.usage ?? []} detectors />

      <details className={s.disclosure}>
        <summary>How the firewall decided</summary>
        {r.attacks.map((a, i) => (
          <div key={i} className={s.finding}>
            <strong>{a.types.map(pretty).join(", ")}</strong>
            <div className="muted">
              Found by {a.found_by.join(", ")} · confidence {a.confidence} · {a.channel}
              {hiddenIn(a).length > 0 && <> · hidden in {hiddenIn(a).join(", ")}</>}
              {a.rules.length > 0 && <> · rules {a.rules.join(", ")}</>}
            </div>
          </div>
        ))}
        {r.hints.map((h, i) => (
          <div key={`h${i}`} className={s.finding}>
            <span className={s.warn}>Weak hint, not removed: {pretty(h.type)} ({h.rule})</span>
            <div className="mono small">&ldquo;{h.text}&rdquo;</div>
          </div>
        ))}
        <div className="table-wrap" style={{ marginTop: "var(--space-3)" }}>
          <table className="table">
            <thead><tr><th>Classifier</th><th>Whole text</th><th>Worst 3-sentence window</th></tr></thead>
            <tbody>
              {Object.entries(r.scores).map(([name, sc]) => (
                <tr key={name}><td>{name}</td><td className="num">{sc.whole}</td><td className="num">{sc.max_window}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="small muted" style={{ marginTop: "var(--space-3)" }}>
          Lane {pretty(r.lane)} · risk {r.risk ?? "n/a"} · {r.trace.map((t) => `${t.step} ${t.ms} ms`).join(" → ")}
        </p>
        <button className="btn btn--ghost" style={{ marginTop: "var(--space-2)", paddingLeft: 0 }} onClick={() => setShowJson(!showJson)}>
          {showJson ? "Hide" : "Show"} raw JSON
        </button>
        {showJson && <pre className={s.textBlock}>{JSON.stringify(r, null, 2)}</pre>}
      </details>
    </div>
  );
}
