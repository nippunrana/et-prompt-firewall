"use client";

import React from "react";
import { INPUT_TYPES } from "@/lib/input-examples";
import d from "./demo.module.css";
import HeroSimulation from "./HeroSimulation";
import s from "./hero.module.css";

export const EMAIL = "email";

// The pain in plain words, a looping simulation of the checks beside it, then one choice: what the AI reads.
export default function Hero({ selected, onPick }: { selected: string | null; onPick: (key: string) => void }) {
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

          <div className={s.heroCta}>
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
          </div>
        </div>

        <div className={s.heroPipeline}>
          <HeroSimulation />
        </div>
      </div>

      <div className={s.heroActions}>
        <p className={s.otherLabel}>Or check one thing on its own</p>
        <div className={d.chips} role="group" aria-label="Other input types">
          {INPUT_TYPES.map((t) => (
            <button key={t.key} className="chip" aria-pressed={selected === t.key} onClick={() => onPick(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
