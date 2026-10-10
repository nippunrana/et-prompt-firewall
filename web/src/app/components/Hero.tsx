"use client";

import React from "react";
import dashboard from "@/data/dashboard.json";
import { INPUT_TYPES } from "@/lib/input-examples";
import HeroDiagram from "./HeroDiagram";
import HeroSimulation from "./HeroSimulation";
import s from "./hero.module.css";

export const EMAIL = "email";

// A full-width band: the pain in plain words, a quiet diagram beside it and the email demo as its button. Below the
// band, the full choice of what the AI reads, then the looping simulation of the checks, so it never competes with
// the headline.
export default function Hero({ selected, onPick }: { selected: string | null; onPick: (key: string) => void }) {
  const h = dashboard.heldout;
  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <div className={s.heroGrid}>
        {/* Left Column: Narrative */}
        <div className={s.heroNarrative}>
          <div className={s.eyebrowBadge}>
            <span className={s.eyebrowDot} />
            <span className={s.eyebrowText}>Prompt injection firewall for AI agents</span>
          </div>
          <h1 id="hero-title" className={s.headline}>
            Your AI agent does real work. Anything it reads can give it orders.{" "}
            <span className={s.headlineFix}>We take those orders out.</span>
          </h1>
          <p className={s.lede}>
            AI agents now read inboxes, pay invoices and send files, with no person checking each step. One hidden line in an
            email, a web page or a file can make an agent send your data or pay a stranger. The firewall reads everything first
            and removes those lines before the agent acts.
          </p>
          <div className={s.ctaRow}>
            <button type="button" className="btn btn--primary" onClick={() => onPick(EMAIL)}>
              Watch the attack demo →
            </button>
            <a className={s.ctaLink} href="#try-inputs">Or try another input source ↓</a>
          </div>
          <p className={s.proof}>
            <span className={s.proofLabel}>Held-out tests</span>
            <span><strong>{h.public_attacks.caught} of {h.public_attacks.n}</strong> public attacks caught</span>
            <span><strong>{h.real_benign.flagged} of {h.real_benign.n}</strong> real emails wrongly flagged</span>
          </p>
        </div>

        <div className={s.heroVisual}>
          <HeroDiagram />
        </div>
      </div>

      <div className={s.heroActions}>
        <div className={s.ctaLauncher}>
          <p className={s.choiceLabel}>Pick what your agent reads</p>
          <button className={s.emailChoice} aria-pressed={selected === EMAIL} onClick={() => onPick(EMAIL)}>
            <div className={s.emailChoiceIconBadge} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <span className={s.emailChoiceText}>
              <span className={s.emailChoiceKicker}>Email inbox · full agent demo</span>
              <strong className={s.emailChoiceTitle}>Watch an AI agent get attacked, with and without the firewall</strong>
              <span className={s.emailChoiceHint}>An inbox with one attack hidden in it, read by two copies of the same agent.</span>
            </span>
            <span className={s.emailChoiceGo} aria-hidden="true">
              <span className={s.emailChoiceGoLabel}>Launch demo</span> →
            </span>
          </button>

          <div id="try-inputs" className={s.isolatedShelf}>
            <div className={s.isolatedHeader}>
              <span className={s.isolatedDot} />
              <span className={s.otherLabel}>Or test an isolated input source</span>
              <span className={s.isolatedSub}>Two copies of the same agent read it, with and without the firewall, or check it on its own</span>
            </div>
            <div className={s.isolatedGroups}>
              <div className={s.isolatedGroup}>
                <span className={s.groupLabel}>Text & Code</span>
                <div className={s.groupChips} role="group" aria-label="Text and code inputs">
                  {INPUT_TYPES.filter((t) => t.form === "text").map((t) => (
                    <button key={t.key} className="chip" aria-pressed={selected === t.key} onClick={() => onPick(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className={s.groupDivider} aria-hidden="true" />
              <div className={s.isolatedGroup}>
                <span className={s.groupLabel}>Files & OCR</span>
                <div className={s.groupChips} role="group" aria-label="Document and file inputs">
                  {INPUT_TYPES.filter((t) => t.form === "file").map((t) => (
                    <button key={t.key} className="chip" aria-pressed={selected === t.key} onClick={() => onPick(t.key)}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={s.heroPipeline}>
        <p className={s.choiceLabel}>How it works</p>
        <HeroSimulation />
      </div>
    </section>
  );
}
