"use client";

import React, { useState } from "react";
import Logo from "./Logo";
import s from "./shell.module.css";

export interface View {
  label: string;
  title?: string; // views other than the first get a heading and a short intro
  intro?: React.ReactNode;
  content: React.ReactNode;
}

// Every view stays mounted, so a running agent demo keeps polling while another view is open.
export default function AppShell({ views, status, repo }: { views: View[]; status: [string, string][]; repo: string }) {
  const [active, setActive] = useState(0);
  const down = status.filter(([, state]) => state !== "ok").map(([name]) => name);

  return (
    <>
      <header className={s.bar}>
        <div className={`container ${s.inner}`}>
          <span className={s.brand} onClick={() => { setActive(0); window.scrollTo({ top: 0 }); }} style={{ cursor: "pointer" }} title="ET Prompt Firewall">
            <Logo height={32} />
          </span>
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

      <footer className={s.footer}>
        <p className="container">
          <strong>Built with Llama.</strong> The firewall uses{" "}
          <a href="https://huggingface.co/meta-llama/Llama-Prompt-Guard-2-86M" target="_blank" rel="noreferrer">Llama Prompt Guard 2 86M</a>{" "}
          by Meta, under the Llama 4 Community License.
        </p>
      </footer>
    </>
  );
}
