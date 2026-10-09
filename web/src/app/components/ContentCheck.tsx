"use client";

import React, { useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import type { CheckResult } from "@/lib/demo-types";
import type { InputType } from "@/lib/input-examples";
import { StepHeader } from "./AgentDemo";
import DocumentExtractor from "./DocumentExtractor";
import EmailCheck, { type CheckState } from "./EmailCheck";
import s from "./demo.module.css";

const IDLE: CheckState = { loading: false, error: null, result: null, text: "", ms: 0 };

// One input checked on its own, for every type except email (the inbox). `first` is the number of its first step.
// The parent gives it a `key` per type, so switching type starts fresh.
export default function ContentCheck({ type, first }: { type: InputType; first: number }) {
  const [text, setText] = useState("");
  const [state, setState] = useState<CheckState>(IDLE);

  async function run(request: () => Promise<Response>, checked?: string) {
    setState({ ...IDLE, loading: true });
    const started = Date.now();
    try {
      const response = await request();
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
      setState({ loading: false, error: null, result: data as CheckResult, text: checked ?? data.content ?? "", ms: Date.now() - started });
    } catch (error) {
      setState({ ...IDLE, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  const checkText = () =>
    run(() => fetch(`${BASE_PATH}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text, source: type.source, format: type.format }),
    }), text);

  function checkFile(file: Blob, name: string) {
    const form = new FormData();
    form.append("file", file, name);
    return run(() => fetch(`${BASE_PATH}/api/check-file`, { method: "POST", body: form }));
  }

  async function checkExampleFile(name: string) {
    const response = await fetch(`${BASE_PATH}/examples/${name}`);
    await checkFile(await response.blob(), name);
  }

  return (
    <div>
      <section className={s.step}>
        <StepHeader n={first} title={type.form === "file" ? `Upload the ${type.noun}` : `Give it the ${type.noun}`}
          hint={`What the firewall does first: ${type.frontEnd}`} />
        <div className={s.stepBody}>
          {type.form === "file" ? (
            <div className={s.chips}>
              <input type="file" className="field" accept={type.accept} disabled={state.loading}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) checkFile(f, f.name); }} />
              {type.example && (
                <button className="btn btn--ghost" disabled={state.loading} onClick={() => checkExampleFile(type.example!)}>
                  Check the example {type.noun}
                </button>
              )}
            </div>
          ) : (
            <>
              <textarea className="field mono" rows={10} value={text} disabled={state.loading}
                placeholder={`Paste the ${type.noun} here`} onChange={(e) => setText(e.target.value)} />
              <div className={s.chips}>
                <button className="btn btn--primary" onClick={checkText} disabled={state.loading || !text.trim()}>
                  Check this {type.noun}
                </button>
                {type.example && (
                  <button className="btn btn--ghost" disabled={state.loading} onClick={() => setText(type.example!)}>
                    Load an example
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      <section className={s.step}>
        <StepHeader n={first + 1} title="What the firewall did"
          hint="The same checks as for every email: rules, two classifiers, the language gate, then the LLM judge and sandbox on anything flagged." />
        <div className={s.stepBody}>
          {state.loading || state.error || state.result
            ? <EmailCheck state={state} noun={type.noun} />
            : <p className="small muted">Nothing checked yet.</p>}
          {type.form === "file" && (
            <details style={{ marginTop: "var(--space-6)" }}>
              <summary>Only extract the text from a file, without checking it</summary>
              <DocumentExtractor />
            </details>
          )}
        </div>
      </section>
    </div>
  );
}
