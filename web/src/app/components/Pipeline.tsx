"use client";

import React, { useMemo, useRef } from "react";
import type { Email, Job, Reads, Step } from "@/lib/demo-types";
import { duration, gsap, useGSAP } from "@/lib/motion";
import { pipeline, type Row, type RowState } from "@/lib/pipeline";
import StatusIcon from "./StatusIcon";
import p from "./pipeline.module.css";

const TICKED = new Set<RowState>(["done", "flag", "skip", "off"]);
const LABEL: Record<RowState, string> = { done: "done", flag: "done, raised a signal", running: "running", pending: "waiting", skip: "not needed", off: "not there" };

export function Mark({ state }: { state: RowState }) {
  return (
    <span data-mark data-state={state} className={p.mark} aria-label={LABEL[state]}>
      {state === "done" && <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      {state === "flag" && "!"}
      {state === "skip" && "–"}
    </span>
  );
}

export function Text({ row }: { row: Row }) {
  return (
    <span className={p.text}>
      <span className={p.name}>{row.name}</span>
      {(row.value || row.state === "running") && <span className={p.value}>{row.value ?? "running…"}</span>}
    </span>
  );
}

// The run as a live checklist: each row ticks when its step really finishes (see lib/pipeline.ts)
export default function Pipeline({ job, emails, protectedRun, reads, noun, unsafe }: {
  job: Job; emails: Email[]; protectedRun: boolean; reads?: Reads; noun?: string; unsafe?: (action: Step) => boolean;
}) {
  const items = useMemo(() => pipeline(job, emails, protectedRun, reads, noun, unsafe), [job, emails, protectedRun, reads, noun, unsafe]);
  const root = useRef<HTMLOListElement>(null);

  // After every poll: pop the marks that just reached a final state, a beat apart, all within one poll
  useGSAP(() => {
    const fresh = [...(root.current?.querySelectorAll<HTMLElement>("[data-mark]") ?? [])].filter((m) => {
      const state = m.dataset.state as RowState;
      if (!TICKED.has(state) || m.dataset.ticked === state) return false;
      m.dataset.ticked = state;
      return true;
    });
    if (fresh.length) {
      gsap.fromTo(fresh, { scale: 0.3 }, { scale: 1, duration: duration(0.4), ease: "back.out(2.4)",
        stagger: { amount: duration(Math.min(0.8, fresh.length * 0.12)) } });
    }
  }, { dependencies: [items], scope: root });

  return (
    <ol ref={root} className={p.pipe} aria-label="What runs, step by step">
      {items.map((it) => (
        <li key={it.key} className={p.item} data-state={it.state}>
          <Mark state={it.state} />
          <div>
            {it.checkpoint && <span className={p.checkpoint}>Checkpoint {it.checkpoint}</span>}
            <Text row={it} />
            {it.rows && it.rows.length > 0 && (
              <ol key={it.rowsKey} className={p.rows}>
                {it.rows.map((r) => (
                  <li key={r.key} className={p.row} data-state={r.state} data-alert={r.alert}>
                    {r.alert ? <StatusIcon kind={r.alert} /> : <Mark state={r.state} />}<Text row={r} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
