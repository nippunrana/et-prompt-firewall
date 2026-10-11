"use client";

import React, { useEffect, useState } from "react";
import LlmModeSwitch from "./LlmModeSwitch";
import Logo from "./Logo";
import SaveScope from "./SaveScope";
import s from "./shell.module.css";

export interface View {
  label: string;
  title?: string; // views other than the first get a heading and a short intro
  intro?: React.ReactNode;
  content: React.ReactNode;
}

export const HOME_EVENT = "et-home";

// Every view stays mounted, so a running agent demo keeps polling while another view is open.
export default function AppShell({ views, repo }: { views: View[]; repo: string }) {
  const [active, setActive] = useState(0);

  // Other views can send the visitor home too (the empty audit log does)
  useEffect(() => {
    const home = () => { setActive(0); window.scrollTo({ top: 0 }); };
    window.addEventListener(HOME_EVENT, home);
    return () => window.removeEventListener(HOME_EVENT, home);
  }, []);

  return (
    <>
      <header className={s.bar}>
        <div className={`container ${s.inner}`}>
          {/* The logo is the way home: the first view, with its hero open again (TryIt listens for HOME_EVENT) */}
          <button type="button" className={s.brand} title="ET Prompt Firewall: home"
            onClick={() => { setActive(0); window.scrollTo({ top: 0 }); window.dispatchEvent(new Event(HOME_EVENT)); }}>
            <Logo height={26} />
          </button>
          <nav className={s.nav} role="tablist" aria-label="Views">
            {views.slice(1).map((v, n) => (
              <button key={v.label} role="tab" aria-selected={n + 1 === active} className={s.navItem}
                onClick={() => { setActive(n + 1); window.scrollTo({ top: 0 }); }}>
                {v.label}
              </button>
            ))}
          </nav>
          <div className={s.end}>
            <LlmModeSwitch />
            <SaveScope />
            <a className={s.github} href={repo} target="_blank" rel="noreferrer" title="Source on GitHub" aria-label="GitHub">
              <svg width="20" height="20" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
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
