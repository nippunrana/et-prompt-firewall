"use client";

import { INPUT_TYPES } from "@/lib/input-examples";
import d from "./demo.module.css";
import s from "./hero.module.css";

export const EMAIL = "email";

// The pain in plain words, then one choice: what the AI reads. Email leads because it is the full agent demo;
// every other input source is checked on its own.
export default function Hero({ selected, onPick }: { selected: string | null; onPick: (key: string) => void }) {
  return (
    <section className={s.hero} aria-labelledby="hero-title">
      <p className={s.eyebrow}>Prompt injection firewall for AI agents</p>
      <h1 id="hero-title" className={s.headline}>
        Your AI agent does real work. Anything it reads can give it orders. <span className={s.headlineFix}>We take those orders out.</span>
      </h1>
      <p className={s.lede}>
        AI agents now read inboxes, pay invoices and send files, with no person checking each step. One hidden line in an
        email, a web page or a file can make an agent send your data or pay a stranger. The firewall reads everything first
        and removes those lines before the agent acts.
      </p>

      <p className={s.choiceLabel}>Pick what your agent reads</p>
      <button className={s.emailChoice} aria-pressed={selected === EMAIL} onClick={() => onPick(EMAIL)}>
        <span className={s.emailChoiceText}>
          <span className={s.emailChoiceKicker}>Email inbox · full agent demo</span>
          <strong className={s.emailChoiceTitle}>Watch an AI agent get attacked, with and without the firewall</strong>
          <span className={s.emailChoiceHint}>An inbox with one attack hidden in it, read by two copies of the same agent.</span>
        </span>
        <span className={s.emailChoiceGo} aria-hidden="true">→</span>
      </button>

      <p className={s.otherLabel}>Or check one thing on its own</p>
      <div className={d.chips} role="group" aria-label="Other input types">
        {INPUT_TYPES.map((t) => (
          <button key={t.key} className="chip" aria-pressed={selected === t.key} onClick={() => onPick(t.key)}>{t.label}</button>
        ))}
      </div>
    </section>
  );
}
