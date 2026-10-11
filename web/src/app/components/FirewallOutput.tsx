"use client";

import { useRef, useState } from "react";
import { VERDICT_LABEL } from "@/lib/demo-types";
import o from "./output.module.css";

// What the caller gets back from the firewall, under the response's own field names: the text to pass on
// (`clean_content`) and what was cut (`removed`). Shown verbatim from the check; never rebuilt in the browser.
export default function FirewallOutput({ verdict, cleanContent, removed, open = true }: {
  verdict: string;
  cleanContent: string | null | undefined; // undefined: a run recorded before the field was kept
  removed: string[];
  open?: boolean;
}) {
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const json = useRef<HTMLDialogElement>(null);
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

  return (
    <>
    <details className={o.output} open={open}>
      <summary className={o.summary}>
        Firewall output <span className={o.call}>POST /check →</span>
        <code className={o.verdict}>verdict: &quot;{verdict}&quot;</code>
        <span className={`pill pill--${verdict}`}>{VERDICT_LABEL[verdict] ?? verdict}</span>
        {cleanContent !== undefined && (
          <button type="button" className={`btn btn--ghost ${o.copy}`}
            onClick={(e) => { e.preventDefault(); json.current?.showModal(); }}>JSON output</button>
        )}
      </summary>

      <div className={o.field}>
        <code className={o.name}>clean_content</code>
        <span className={o.note}>
          {verdict === "quarantine" ? "null: blocked, nothing is passed on"
            : verdict === "allow" ? "the content as it came in: nothing needed cutting" : "the cleaned content, safe to pass on"}
        </span>
        {typeof cleanContent === "string" && (
          <button type="button" className={`btn btn--ghost ${o.copy}`} onClick={() => copyText(cleanContent)}>
            {copy === "done" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy"}
          </button>
        )}
      </div>
      {cleanContent === undefined
        ? <pre className={`${o.box} ${o.empty}`}>not recorded in this run</pre>
        : <pre className={`${o.box} ${cleanContent === null ? o.empty : ""}`}>{cleanContent ?? "null"}</pre>}

      <div className={o.field}>
        <code className={o.name}>removed</code>
        <span className={o.note}>
          {removed.length === 0 ? "[]: nothing was cut" : `${removed.length} part${removed.length === 1 ? "" : "s"} cut from the original`}
        </span>
      </div>
      <div className={`${o.box} ${removed.length === 0 ? o.empty : ""}`}>
        {removed.length === 0 ? "[]" : removed.map((text, i) => <span key={i} data-wipe className={o.cut}>{text}</span>)}
      </div>
    </details>

    {/* Outside the <details>: a closed one would hide it. A modal <dialog> sits in the top layer, above the drawer. */}
    {/* Escape closes only this pop-up: the run drawer behind it listens for Escape on the window */}
    <dialog ref={json} className={o.dialog} aria-label="Firewall output as JSON"
      onKeyDown={(e) => { if (e.key === "Escape") e.stopPropagation(); }}
      onClick={(e) => { if (e.target === e.currentTarget) json.current?.close(); }}>
      <div className={o.dialogHead}>
        <strong>Firewall output</strong> <span className={o.call}>POST /check → JSON</span>
        <button type="button" className={`btn btn--ghost ${o.copy}`} onClick={() => copyText(response)}>
          {copy === "done" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy JSON"}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => json.current?.close()} aria-label="Close">✕</button>
      </div>
      <p className={o.note}>
        The fields a caller acts on, from this check. The full response also carries the attacks found, the classifier
        scores, the judge&apos;s and sandbox&apos;s results, timings and cost.
      </p>
      <pre className={o.json}>{response}</pre>
    </dialog>
    </>
  );
}
