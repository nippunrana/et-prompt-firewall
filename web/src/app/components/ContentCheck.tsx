"use client";

import React, { useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import { emailText, type CheckResult } from "@/lib/demo-types";
import { INPUT_TYPES, type InputType } from "@/lib/input-examples";
import EmailCheck, { type CheckState } from "./EmailCheck";
import s from "./demo.module.css";

const IDLE: CheckState = { loading: false, error: null, result: null, text: "", ms: 0 };
const BLANK_EMAIL = { from: "Someone <someone@example.com>", subject: "", body: "" };

// Pick the input type first: it decides the form and the firewall's front end. The detectors after it are shared.
export default function ContentCheck() {
  const [type, setType] = useState<InputType>(INPUT_TYPES[0]);
  const [text, setText] = useState("");
  const [email, setEmail] = useState(BLANK_EMAIL);
  const [state, setState] = useState<CheckState>(IDLE);

  function pick(t: InputType) {
    setType(t);
    setText("");
    setState(IDLE);
  }

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

  function checkText() {
    const content = type.form === "email" ? emailText(email) : text;
    return run(() => fetch(`${BASE_PATH}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, source: type.source, format: type.format }),
    }), content);
  }

  function checkFile(file: Blob, name: string) {
    const form = new FormData();
    form.append("file", file, name);
    return run(() => fetch(`${BASE_PATH}/api/check-file`, { method: "POST", body: form }));
  }

  async function checkExampleFile(name: string) {
    const response = await fetch(`${BASE_PATH}/examples/${name}`);
    await checkFile(await response.blob(), name);
  }

  const ready = type.form === "email" ? email.body.trim() : text.trim();

  return (
    <div className={s.check}>
      <span className="label">1 · What is the input?</span>
      <div className={s.chips} role="group" aria-label="Input type">
        {INPUT_TYPES.map((t) => (
          <button key={t.key} className="chip" aria-pressed={type.key === t.key} disabled={state.loading} onClick={() => pick(t)}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="small"><strong>Front end:</strong> {type.frontEnd}</p>

      <span className="label">2 · The {type.noun}</span>
      {type.form === "email" && (
        <>
          <label><span className="label">From</span>
            <input className="field" value={email.from} disabled={state.loading} onChange={(e) => setEmail({ ...email, from: e.target.value })} />
          </label>
          <label><span className="label">Subject</span>
            <input className="field" value={email.subject} disabled={state.loading} onChange={(e) => setEmail({ ...email, subject: e.target.value })} />
          </label>
          <label><span className="label">Body</span>
            <textarea className="field mono" rows={8} value={email.body} disabled={state.loading} onChange={(e) => setEmail({ ...email, body: e.target.value })} />
          </label>
        </>
      )}
      {type.form === "text" && (
        <textarea className="field mono" rows={10} value={text} disabled={state.loading}
          placeholder={`Paste the ${type.noun} here`} onChange={(e) => setText(e.target.value)} />
      )}
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
        <div className={s.chips}>
          <button className="btn btn--primary" onClick={checkText} disabled={state.loading || !ready}>
            Check this {type.noun}
          </button>
          {type.example && (
            <button className="btn btn--ghost" disabled={state.loading} onClick={() => setText(type.example!)}>
              Load an example
            </button>
          )}
        </div>
      )}

      {(state.loading || state.error || state.result) && <span className="label">3 · What the firewall did</span>}
      <EmailCheck state={state} noun={type.noun} />
    </div>
  );
}
