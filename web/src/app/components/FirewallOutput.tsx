"use client";

import React, { useId, useRef, useState } from "react";
import { pretty, VERDICT_LABEL, type Attack } from "@/lib/demo-types";
import o from "./output.module.css";

// The checked text with every removed span marked, using the firewall's character offsets
export function highlight(text: string, attacks: Attack[]) {
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

// Small line icons, so each button shows what it does before it is pressed
const ICON = {
  compare: <path d="M2 3h5v10H2zM9 3h5v10H9z" />,
  json: <path d="M6 2.5c-1.5 0-2 .7-2 2v1.5c0 1-.5 1.5-1.5 2 1 .5 1.5 1 1.5 2v1.5c0 1.3.5 2 2 2M10 2.5c1.5 0 2 .7 2 2v1.5c0 1 .5 1.5 1.5 2-1 .5-1.5 1-1.5 2v1.5c0 1.3-.5 2-2 2" />,
  copy: <path d="M5 5h8v8H5zM3 11V3h8" />,
  popup: <path d="M9 3h4v4M13 3 7.5 8.5M11 9.5V13H3V5h3.5" />,
};
const Icon = ({ name }: { name: keyof typeof ICON }) => (
  <svg className={o.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true">{ICON[name]}</svg>
);

// A modal <dialog>: it sits in the top layer, above the run drawer. Escape closes only the pop-up, since
// the drawer behind it listens for Escape on the window; a click on the backdrop closes it too.
function Popup({ open, label, wide, children }: {
  open: React.RefObject<HTMLDialogElement | null>; label: string; wide?: boolean; children: React.ReactNode;
}) {
  return (
    <dialog ref={open} className={`${o.dialog} ${wide ? o.wide : ""}`} aria-label={label}
      onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
      onClick={(e) => { if (e.target === e.currentTarget) open.current?.close(); }}>
      <div className={o.dialogHead}>
        <strong>{label}</strong>
        <button type="button" className={`btn btn--ghost ${o.close}`} onClick={() => open.current?.close()} aria-label="Close">✕</button>
      </div>
      {children}
    </dialog>
  );
}

// What the caller gets back from the firewall, under the response's own field names: the text to pass on
// (`clean_content`) and what was cut (`removed`). Shown verbatim from the check; never rebuilt in the browser.
export default function FirewallOutput({ verdict, cleanContent, removed, original, attacks = [], open = true }: {
  verdict: string;
  cleanContent: string | null | undefined; // undefined: a run recorded before the field was kept
  removed: string[];
  original?: string; // the exact text that was checked; absent in runs recorded before it was kept
  attacks?: Attack[]; // their spans point into `original`
  open?: boolean;
}) {
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const [shown, setShown] = useState(open); // only the Show/Hide button folds the output, never the header row
  const body = useId();
  const json = useRef<HTMLDialogElement>(null);
  const compare = useRef<HTMLDialogElement>(null);
  const response = JSON.stringify({ verdict, clean_content: cleanContent ?? null, removed }, null, 2);

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopy("done");
    } catch { // no clipboard outside a secure context (https or localhost)
      setCopy("failed");
    }
    setTimeout(() => setCopy("idle"), 2000);
  };
  const copyLabel = (idle: string) => copy === "done" ? "Copied" : copy === "failed" ? "Copy failed" : idle;

  const removedBox = (
    <>
      <div className={o.field}>
        <code className={o.name}>removed</code>
        <span className={o.note}>
          {removed.length === 0 ? "[]: nothing was cut" : `${removed.length} part${removed.length === 1 ? "" : "s"} cut from the original`}
        </span>
      </div>
      <div className={`${o.box} ${removed.length === 0 ? o.empty : ""}`}>
        {removed.length === 0 ? "[]" : removed.map((text, i) => <span key={i} data-wipe className={o.cut}>{text}</span>)}
      </div>
    </>
  );
  const cleanBox = cleanContent === undefined
    ? <pre className={`${o.box} ${o.empty}`}>not recorded in this run</pre>
    : <pre className={`${o.box} ${cleanContent === null ? o.empty : ""}`}>{cleanContent ?? "null"}</pre>;

  return (
    <>
    <div className={o.output}>
      <div className={o.summary}>
        Firewall output <span className={o.call}>POST /check →</span>
        <code className={o.verdict}>verdict: &quot;{verdict}&quot;</code>
        <span className={`pill pill--${verdict}`}>{VERDICT_LABEL[verdict] ?? verdict}</span>
        <button type="button" className={`btn ${o.toggle}`} aria-expanded={shown} aria-controls={body} onClick={() => setShown(!shown)}>
          {shown ? "Hide" : "Show"}
          <svg className={`${o.icon} ${shown ? o.turned : ""}`} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
        </button>
        <span className={o.actions}>
          {original !== undefined && cleanContent !== undefined && (
            <button type="button" className="btn" title="Opens a pop-up" onClick={() => compare.current?.showModal()}>
              <Icon name="compare" /> Compare with original <Icon name="popup" />
            </button>
          )}
          {cleanContent !== undefined && (
            <button type="button" className="btn" title="Opens a pop-up" onClick={() => json.current?.showModal()}>
              <Icon name="json" /> JSON output <Icon name="popup" />
            </button>
          )}
        </span>
      </div>

      <div id={body} hidden={!shown}>

      <div className={o.field}>
        <code className={o.name}>clean_content</code>
        <span className={o.note}>
          {verdict === "quarantine" ? "null: blocked, nothing is passed on"
            : verdict === "allow" ? "the content as it came in: nothing needed cutting" : "the cleaned content, safe to pass on"}
        </span>
        {typeof cleanContent === "string" && (
          <button type="button" className={`btn ${o.copy}`} onClick={() => copyText(cleanContent)}><Icon name="copy" /> {copyLabel("Copy")}</button>
        )}
      </div>
      {cleanBox}
      {removedBox}
      </div>
    </div>

    {original !== undefined && (
      <Popup open={compare} label="Compare with original" wide>
        <div className={o.columns}>
          <div>
            <div className={o.field}>
              <code className={o.name}>content</code>
              <span className={o.note}>the original, as sent to the firewall{attacks.length > 0 && "; cut parts marked"}</span>
            </div>
            <pre className={`${o.box} ${o.tall}`}>{highlight(original, attacks)}</pre>
          </div>
          <div>
            <div className={o.field}>
              <code className={o.name}>clean_content</code>
              <span className={`pill pill--${verdict}`}>{VERDICT_LABEL[verdict] ?? verdict}</span>
            </div>
            {cleanBox}
            {removedBox}
          </div>
        </div>
      </Popup>
    )}
    <Popup open={json} label="Firewall output as JSON">
      <p className={o.note}>
        The fields a caller acts on, from this check (POST /check). The full response also carries the attacks found,
        the classifier scores, the judge&apos;s and sandbox&apos;s results, timings and cost.
      </p>
      <button type="button" className={`btn ${o.copy}`} onClick={() => copyText(response)}><Icon name="copy" /> {copyLabel("Copy JSON")}</button>
      <pre className={o.json}>{response}</pre>
    </Popup>
    </>
  );
}
