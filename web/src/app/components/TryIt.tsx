"use client";

import React, { useEffect, useRef, useState } from "react";
import { INPUT_TYPES } from "@/lib/input-examples";
import { duration, gsap, useGSAP } from "@/lib/motion";
import AgentDemo from "./AgentDemo";
import { HOME_EVENT } from "./AppShell";
import ContentCheck from "./ContentCheck";
import Hero, { EMAIL } from "./Hero";
import s from "./hero.module.css";

// Try it, one thing at a time: the hero asks what the AI reads; picking it folds the hero into a slim bar and slides
// the form in. Clicking the bar opens the hero again to switch. The inbox stays mounted while another type is shown,
// so a running agent job keeps polling.
export default function TryIt() {
  const root = useRef<HTMLDivElement>(null);
  const [key, setKey] = useState<string | null>(null);
  const [heroOpen, setHeroOpen] = useState(true);
  const type = INPUT_TYPES.find((t) => t.key === key);

  const toTop = () => window.scrollTo({ top: 0, behavior: duration(1) ? "smooth" : "instant" });
  function pick(next: string) { setKey(next); setHeroOpen(false); toTop(); }
  function reopen() { setHeroOpen(true); toTop(); }

  // The logo opens the hero again, like the bar does; a running agent job keeps going behind it.
  useEffect(() => {
    const home = () => setHeroOpen(true);
    window.addEventListener(HOME_EVENT, home);
    return () => window.removeEventListener(HOME_EVENT, home);
  }, []);

  useGSAP(() => {
    if (!key) return; // first load: the hero is open and nothing is picked yet
    const hero = `.${s.heroFold}`, bar = `.${s.inputBar}`, panel = `.${s.panel}`;
    // Focus follows the motion, so keyboard users never land on something that just hid
    // (absolute positions, not "-=": with reduced motion every duration is 0 and a negative offset skips the focus call).
    // The panel slides with padding, never a transform: a transform would pin the fixed run bar and drawer to it.
    const focus = (selector: string) => () => root.current?.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    // Reopening the hero hides the form too (display, not unmount, so a running agent job keeps polling).
    if (heroOpen) {
      gsap.timeline()
        .to(bar, { autoAlpha: 0, y: -8, duration: duration(0.2), ease: "power2.in" })
        .to(panel, { autoAlpha: 0, duration: duration(0.2), ease: "power2.in" }, 0)
        .set(panel, { display: "none" }, duration(0.2))
        .to(hero, { height: "auto", autoAlpha: 1, duration: duration(0.6), ease: "power3.out" }, 0)
        .call(focus(`.${s.heroFold} [aria-pressed="true"]`));
    } else {
      gsap.timeline()
        .set(panel, { clearProps: "display" })
        .to(hero, { height: 0, autoAlpha: 0, duration: duration(0.55), ease: "power3.inOut" })
        .fromTo(bar, { autoAlpha: 0, y: -8 }, { autoAlpha: 1, y: 0, duration: duration(0.35), ease: "power2.out" }, duration(0.35))
        .fromTo(panel, { autoAlpha: 0, paddingTop: 56 }, { autoAlpha: 1, paddingTop: 0, duration: duration(0.7), ease: "expo.out", clearProps: "paddingTop" }, "<")
        .call(focus(bar));
    }
  }, { dependencies: [key, heroOpen], scope: root });

  const instruction = key === EMAIL
    ? "Pick an attack, edit the inbox, then run both agents."
    : type && `${type.form === "file" ? "Upload your" : "Paste your"} ${type.noun} or use the example, then run both agents: one with the firewall, one without.`;

  return (
    <div ref={root}>
      <div id="try-hero" className={s.heroFold}>
        <Hero selected={key} onPick={pick} />
      </div>

      {key && (
        <button className={s.inputBar} aria-expanded={heroOpen} aria-controls="try-hero" onClick={reopen}>
          <span className={s.inputBarLabel}>Your agent reads</span>
          <strong>{key === EMAIL ? "An email inbox" : type?.label}</strong>
          <span className={s.inputBarHint}>{instruction}</span>
          <span className={s.inputBarChange}>Change ↑</span>
        </button>
      )}

      <div className={s.panel}>
        <div hidden={key !== EMAIL}><AgentDemo active={key === EMAIL} /></div>
        {type && <ContentCheck key={type.key} type={type} first={1} />}
      </div>
    </div>
  );
}
