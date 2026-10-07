"use client";

import React, { useEffect, useRef, useState } from "react";
import { duration, gsap, useGSAP } from "@/lib/motion";
import s from "./drawer.module.css";

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

// A panel that slides in from the right over a dimmed page. It stays mounted while it slides out,
// and closing it never stops a run: the agents keep going and the panel can be reopened.
export default function RunDrawer({ open, onClose, title, subtitle, children }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const motion = useRef<gsap.core.Timeline | null>(null);
  const [mounted, setMounted] = useState(open);
  if (open && !mounted) setMounted(true);

  useGSAP(() => {
    if (!mounted) return;
    motion.current?.kill(); // reopening mid-close must not let the close finish and unmount the panel
    if (open) {
      motion.current = gsap.timeline()
        .fromTo(`.${s.backdrop}`, { autoAlpha: 0 }, { autoAlpha: 1, duration: duration(0.35), ease: "power2.out" })
        .fromTo(`.${s.panel}`, { xPercent: 100 }, { xPercent: 0, duration: duration(0.7), ease: "expo.out" }, 0);
    } else {
      motion.current = gsap.timeline({ onComplete: () => setMounted(false) })
        .to(`.${s.panel}`, { xPercent: 100, duration: duration(0.45), ease: "power3.in" })
        .to(`.${s.backdrop}`, { autoAlpha: 0, duration: duration(0.3), ease: "power2.in" }, "<0.15");
    }
  }, { dependencies: [open, mounted], scope: root });

  // Keyboard and scroll behaviour of a modal panel: Escape closes it, focus moves in and back out,
  // and the page behind it does not scroll.
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previous?.focus();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div ref={root} className={s.root}>
      <div className={s.backdrop} onClick={onClose} aria-hidden="true" />
      <aside className={s.panel} role="dialog" aria-modal="true" aria-labelledby="run-drawer-title">
        <header className={s.head}>
          <div>
            <h2 id="run-drawer-title" className={s.title}>{title}</h2>
            <p className="small muted">{subtitle}</p>
          </div>
          <button ref={closeButton} className={`btn btn--ghost ${s.close}`} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <path d="M4.5 4.5l9 9m0-9l-9 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className={s.body}>{children}</div>
      </aside>
    </div>
  );
}
