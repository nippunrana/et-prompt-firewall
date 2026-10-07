"use client";

import React, { useState } from "react";
import s from "./shell.module.css";

export interface View {
  label: string;
  title?: string; // views other than the first get a heading and a short intro
  intro?: React.ReactNode;
  content: React.ReactNode;
}

function Shield() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2l6 2.5v4.6c0 4-2.6 7.2-6 8.4-3.4-1.2-6-4.4-6-8.4V4.5L10 2z" fill="var(--ink-900)" />
      <path d="M7 10l2 2 4-4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Every view stays mounted, so a running agent demo keeps polling while another view is open.
export default function AppShell({ views, status, repo }: { views: View[]; status: [string, string][]; repo: string }) {
  const [active, setActive] = useState(0);
  const down = status.filter(([, state]) => state !== "ok").map(([name]) => name);

  return (
    <>
      <header className={s.bar}>
        <div className={`container ${s.inner}`}>
          <span className={s.brand}><Shield /> ET Prompt Firewall</span>
          <nav className={s.nav} role="tablist" aria-label="Views">
            {views.map((v, i) => (
              <button key={v.label} role="tab" aria-selected={i === active} className={s.navItem}
                onClick={() => { setActive(i); window.scrollTo({ top: 0 }); }}>
                {v.label}
              </button>
            ))}
          </nav>
          <div className={s.end}>
            <span className={s.status} title={status.map(([n, st]) => `${n}: ${st}`).join(" · ")}>
              <span className={s.dot} style={{ background: down.length ? "var(--block)" : "var(--allow)" }} />
              {down.length ? `${down.join(", ")} down` : "All services up"}
            </span>
            <a className={s.github} href={repo} target="_blank" rel="noreferrer">GitHub</a>
          </div>
        </div>
      </header>

      {views.map((v, i) => (
        <main key={v.label} role="tabpanel" hidden={i !== active} className={`container ${s.view}`}>
          {v.title && (
            <div className={s.viewHead}>
              <h1 className={s.viewTitle}>{v.title}</h1>
              {v.intro && <p className={s.viewIntro}>{v.intro}</p>}
            </div>
          )}
          {v.content}
        </main>
      ))}
    </>
  );
}
