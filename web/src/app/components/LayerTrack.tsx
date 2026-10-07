"use client";

import React, { useMemo, useRef, useState } from "react";
import type { Layers } from "@/lib/demo-types";
import { CLEAN_SUMMARY, stations, type Station } from "@/lib/layers";
import { duration, gsap, useGSAP } from "@/lib/motion";
import t from "./track.module.css";

// The firewall answers once per email with every layer's result, so the dot-to-dot travel is a replay.
// Each leg is paced by how long that layer really took (log-scaled), so a slow LLM call visibly takes longer.
const pace = (ms: number) => Math.min(0.45, 0.1 + Math.log10(1 + ms) * 0.08);

// The layer worth reading first: the judge's reason if it ran, else the first layer that raised a signal
const decisive = (list: Station[]) =>
  list.find((s) => s.key === "judge" && (s.state === "flag" || s.state === "clear")) ?? list.find((s) => s.state === "flag") ?? null;

export default function LayerTrack({ layers, lane }: { layers: Layers; lane: string | undefined }) {
  const list = useMemo(() => stations(layers, lane), [layers, lane]);
  const [pinned, setPinned] = useState<string | null>(() => decisive(list)?.key ?? null);
  const [hover, setHover] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const shown = list.find((s) => s.key === (hover ?? pinned));

  // Plays once, when the email's result arrives
  useGSAP(() => {
    const dots = gsap.utils.toArray<HTMLElement>("[data-station]");
    const tl = gsap.timeline();
    tl.set("[data-fill]", { scaleX: 0, transformOrigin: "left center" });
    dots.forEach((dot, i) => {
      if (i > 0) tl.to("[data-fill]", { scaleX: i / (dots.length - 1), duration: duration(pace(list[i].ms)), ease: "power1.inOut" });
      tl.from(dot, { scale: 0.4, autoAlpha: 0, duration: duration(0.25), ease: "back.out(2.2)" }, i > 0 ? "-=0.1" : 0);
    });
  }, { scope: root });

  return (
    <div ref={root} className={t.wrap}>
      <div className={t.track} onMouseLeave={() => setHover(null)}>
        <span className={t.rail} aria-hidden="true"><span data-fill className={t.fill} /></span>
        <ol className={t.stations} aria-label="What each firewall layer found">
          {list.map((s) => (
            <li key={s.key}>
              <button type="button" data-station data-state={s.state} className={t.station}
                aria-pressed={pinned === s.key} aria-label={`${s.name}: ${s.value}`}
                onMouseEnter={() => setHover(s.key)} onFocus={() => setHover(s.key)} onBlur={() => setHover(null)}
                onClick={() => setPinned(pinned === s.key ? null : s.key)}>
                <span className={t.dot} />
                <span className={t.name}>{s.name}</span>
                <span className={t.value}>{s.value}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <p className={t.caption} aria-live="polite">
        {shown ? <><strong>{shown.name}.</strong> {shown.detail}</> : <span className="muted">{lane === "clean" ? CLEAN_SUMMARY : "Point at a dot to see what that layer did."}</span>}
      </p>
    </div>
  );
}
