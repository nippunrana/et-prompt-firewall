"use client";

import React, { useMemo, useRef, useState } from "react";
import type { Step } from "@/lib/demo-types";
import { duration, gsap, useGSAP } from "@/lib/motion";
import { elapsed, LANE_LABEL, segments, type Segment } from "@/lib/run-audit";
import type { Lane, RunRecord } from "@/lib/run-history";
import StatusIcon from "./StatusIcon";
import a from "./audit.module.css";

const LANES: Lane[] = ["unprotected", "protected"];
const INSTANT = new Set<Segment["kind"]>(["read", "action", "blocked", "unsafe"]);

type Picked = { seg: Segment; lane: Lane };

// The moment worth reading first: a blocked action, an unsafe one that ran, then a check that cut something
const decisive = (all: Picked[]) => all.find((p) => p.seg.kind === "blocked") ?? all.find((p) => p.seg.kind === "unsafe")
  ?? all.find((p) => p.seg.kind === "check" && p.seg.verdict !== "allow") ?? null;

// Both lanes on one time axis, from the recorded finish time of every step: the cost of checking shows as length,
// and the moment an attack was stopped (or was not) as a marker. A replay of the record, never live progress.
export default function RunTimeline({ run, unsafe }: { run: RunRecord; unsafe: (st: Step) => string | null }) {
  const root = useRef<HTMLDivElement>(null);
  const lanes = useMemo(() => LANES.map((lane) => ({ lane, segs: segments(run, lane, unsafe) })), [run, unsafe]);
  const all = lanes.flatMap((l) => l.segs.map((seg) => ({ seg, lane: l.lane })));
  const total = Math.max(1, ...all.map((p) => p.seg.end));
  const [pinned, setPinned] = useState<Picked | null>(() => decisive(all));
  const [hover, setHover] = useState<Picked | null>(null);
  const shown = hover ?? pinned; // the panel below describes this block, and only this block wears the dark ring

  // Each lane draws itself left to right, then the markers land
  useGSAP(() => {
    gsap.timeline()
      .fromTo("[data-track]", { clipPath: "inset(0 100% 0 0)" },
        { clipPath: "inset(0 0% 0 0)", duration: duration(1.1), ease: "power2.inOut", stagger: 0.15 })
      .from("[data-marker]", { scale: 0.4, autoAlpha: 0, duration: duration(0.35), ease: "back.out(2.2)", stagger: 0.05 }, "-=0.3");
  }, { scope: root });

  if (!all.length) return <p className="small muted">This run has no step timings to draw.</p>;

  const pct = (ms: number) => `${(100 * ms) / total}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * total);

  return (
    <div ref={root} className={a.timeline}>
      <p className={a.tlHint}>Each block is one step, drawn to scale. Point at a block, or click it to keep it, and read it below.</p>
      {lanes.map(({ lane, segs }) => {
        const end = segs.length ? segs[segs.length - 1].end : 0;
        return (
          <div key={lane} className={a.tlLane}>
            <div className={a.tlHead}>
              <span>{LANE_LABEL[lane]}</span>
              <span className="num muted">{segs.length ? elapsed(end) : "no steps"}</span>
            </div>
            <ol data-track className={a.tlTrack} aria-label={`${LANE_LABEL[lane]}, step by step`} onMouseLeave={() => setHover(null)}>
              {segs.map((seg, i) => {
                const instant = INSTANT.has(seg.kind);
                const me = { seg, lane };
                const select = {
                  onMouseEnter: () => setHover(me), onFocus: () => setHover(me), onBlur: () => setHover(null),
                  onClick: () => setPinned(pinned?.seg === seg ? null : me), "aria-pressed": pinned?.seg === seg,
                  "aria-label": `${LANE_LABEL[lane]}: ${seg.label}`, "data-shown": shown?.seg === seg ? "" : undefined,
                };
                if (instant) {
                  return (
                    <li key={i} data-marker className={a.tlMarker} data-kind={seg.kind} style={{ left: `clamp(11px, ${pct(seg.end)}, calc(100% - 11px))` }}>
                      <button type="button" className={a.tlHit} {...select}>
                        {seg.kind === "blocked" || seg.kind === "unsafe"
                          ? <StatusIcon kind={seg.kind} size={18} />
                          : <span className={a.tlDot} />}
                      </button>
                    </li>
                  );
                }
                const share = (seg.end - seg.start) / total;
                return (
                  <li key={i} className={a.tlSeg} data-kind={seg.kind} data-verdict={seg.verdict}
                    style={{ left: pct(seg.start), width: pct(seg.end - seg.start) }}>
                    <button type="button" className={a.tlHit} {...select}>{share > 0.06 && <span className={a.tlLabel}>{share > 0.16 ? seg.label : seg.short}</span>}</button>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
      <div className={a.tlAxis} aria-hidden="true">
        {ticks.map((t, i) => <span key={i} style={{ left: pct(t) }}>{elapsed(t)}</span>)}
      </div>
      <div className={a.tlDetail} data-kind={shown?.seg.kind} data-verdict={shown?.seg.verdict} aria-live="polite">
        {shown ? (
          <>
            <div className={a.tlDetailHead}>
              <span className={a.tlDetailLane}>{LANE_LABEL[shown.lane]}</span>
              <strong>{shown.seg.label}</strong>
              <span className="num muted">
                {INSTANT.has(shown.seg.kind) ? `at ${elapsed(shown.seg.end)}`
                  : `${elapsed(shown.seg.start)} → ${elapsed(shown.seg.end)}, took ${elapsed(shown.seg.end - shown.seg.start)}`}
              </span>
            </div>
            <p>{shown.seg.detail}</p>
          </>
        ) : <span className="muted">Nothing selected. Point at a block or a marker above to read what happened at that moment.</span>}
      </div>
      <ul className={a.legend}>
        <li><span className={a.swatch} data-kind="check" data-verdict="allow" />Content check, coloured by its verdict</li>
        <li><span className={a.swatch} data-kind="model" />Agent thinking</li>
        <li><span className={a.tlDot} />Read or action that ran</li>
        <li><StatusIcon kind="blocked" size={14} />Blocked action</li>
        <li><StatusIcon kind="unsafe" size={14} />Unsafe action that ran</li>
      </ul>
    </div>
  );
}
