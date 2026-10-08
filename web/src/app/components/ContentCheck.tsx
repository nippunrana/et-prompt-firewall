"use client";

import React, { useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import type { CheckResult } from "@/lib/demo-types";
import { EXAMPLE_FILES, EXAMPLE_PAGE } from "@/lib/input-examples";
import EmailCheck, { type CheckState } from "./EmailCheck";
import s from "./demo.module.css";

// Each input type has its own front end in the firewall (header block, HTML parse, file extraction with
// hidden text marked); after that every type goes through the same detectors, whose results are measured.
const TYPES = [
  { key: "email", label: "Email", noun: "email", source: "email", format: "text",
    hint: "Paste an email: From and Subject lines, a blank line, then the body." },
  { key: "web", label: "Web page (HTML)", noun: "web page", source: "web", format: "html",
    hint: "Paste a page's HTML. Comments, hidden elements and image text are checked as hidden text." },
  { key: "chat", label: "Chat message", noun: "message", source: "user", format: "text",
    hint: "The user's own message: instructions are expected here, so it is checked as a direct attempt." },
  { key: "document", label: "Document text", noun: "document", source: "document", format: "text",
    hint: "Paste text copied from a document, an API response or OCR output." },
  { key: "file", label: "Upload a file", noun: "file", source: "document", format: "text",
    hint: "HTML, PDF, Word, image, Excel or CSV. The firewall reads it the way the agent would, hidden text included." },
] as const;

const IDLE: CheckState = { loading: false, error: null, result: null, text: "", ms: 0 };

export default function ContentCheck() {
  const [type, setType] = useState<(typeof TYPES)[number]>(TYPES[1]);
  const [text, setText] = useState("");
  const [state, setState] = useState<CheckState>(IDLE);
  const fileInput = useRef<HTMLInputElement>(null);

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

  const checkFile = (file: Blob, name: string) => {
    const form = new FormData();
    form.append("file", file, name);
    return run(() => fetch(`${BASE_PATH}/api/check-file`, { method: "POST", body: form }));
  };

  async function checkExample(name: string) {
    const response = await fetch(`${BASE_PATH}/examples/${name}`);
    await checkFile(await response.blob(), name);
  }

  return (
    <div className={s.check}>
      <div className={s.chips} role="group" aria-label="Input type">
        {TYPES.map((t) => (
          <button key={t.key} className="chip" aria-pressed={type.key === t.key} disabled={state.loading}
            onClick={() => { setType(t); setState(IDLE); }}>
            {t.label}
          </button>
        ))}
      </div>
      <p className="small muted">{type.hint}</p>

      {type.key === "file" ? (
        <>
          <div className={s.chips} role="group" aria-label="Example files">
            {EXAMPLE_FILES.map((f) => (
              <button key={f.file} className="chip" disabled={state.loading} onClick={() => checkExample(f.file)}>{f.label}</button>
            ))}
          </div>
          <div>
            <input ref={fileInput} type="file" className="field" disabled={state.loading}
              accept=".html,.htm,.pdf,.docx,.png,.jpg,.jpeg,.webp,.tiff,.bmp,.xlsx,.csv"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) checkFile(f, f.name); }} />
          </div>
        </>
      ) : (
        <>
          <textarea className="field mono" rows={10} value={text} disabled={state.loading}
            placeholder={type.hint} onChange={(e) => setText(e.target.value)} />
          <div className={s.chips}>
            <button className="btn btn--primary" onClick={checkText} disabled={state.loading || !text.trim()}>
              Check this {type.noun}
            </button>
            {type.key === "web" && (
              <button className="btn btn--ghost" disabled={state.loading} onClick={() => setText(EXAMPLE_PAGE)}>
                Load an example page
              </button>
            )}
          </div>
        </>
      )}

      <EmailCheck state={state} noun={type.noun} />
    </div>
  );
}
