"use client";

import React, { useState } from "react";
import { INPUT_TYPES } from "@/lib/input-examples";
import AgentDemo, { StepHeader } from "./AgentDemo";
import ContentCheck from "./ContentCheck";
import s from "./demo.module.css";

const EMAIL = "email";

// Step 1 of Try it: what the agent reads, from the problem statement's input sources. Email opens the inbox demo
// (the agent with and without the firewall); every other type is checked on its own. The inbox stays mounted while
// another type is shown, so a running agent job keeps polling.
export default function TryIt() {
  const [key, setKey] = useState(EMAIL);
  const type = INPUT_TYPES.find((t) => t.key === key);

  return (
    <div>
      <section className={s.step}>
        <StepHeader n={1} title="What does the agent read?"
          hint="Each input type has its own front end in the firewall; after it, every type goes through the same checks." />
        <div className={s.stepBody}>
          <div className={s.chips} role="group" aria-label="Input type">
            <button className="chip" aria-pressed={key === EMAIL} onClick={() => setKey(EMAIL)}>Email</button>
            {INPUT_TYPES.map((t) => (
              <button key={t.key} className="chip" aria-pressed={key === t.key} onClick={() => setKey(t.key)}>{t.label}</button>
            ))}
          </div>
        </div>
      </section>

      <div hidden={key !== EMAIL}><AgentDemo first={2} /></div>
      {type && <ContentCheck key={type.key} type={type} first={2} />}
    </div>
  );
}
