"use client";

import React, { useRef, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";
import type { CheckResult } from "@/lib/demo-types";
import type { InputType } from "@/lib/input-examples";
import { duration, gsap, useGSAP } from "@/lib/motion";
import { StepHeader } from "./AgentDemo";
import DocumentExtractor from "./DocumentExtractor";
import EmailCheck, { type CheckState } from "./EmailCheck";
import RunDrawer from "./RunDrawer";
import RunResults from "./RunResults";
import { useAgentRuns } from "./useAgentRuns";
import s from "./demo.module.css";

const IDLE: CheckState = { loading: false, error: null, result: null, text: "", ms: 0 };
const MAX_REQUEST = 2000; // the demo agent's limit on a request, which a pasted user message becomes

// Every type except email (the inbox): the input goes to two copies of the same agent, with and without the
// firewall, or is checked on its own. `first` is the number of its first step. The parent gives it a `key` per type,
// so switching type starts fresh (and stops polling a run). The result step appears with the first check.
export default function ContentCheck({ type, first }: { type: InputType; first: number }) {
  const root = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [state, setState] = useState<CheckState>(IDLE);
  const checked = state.loading || state.error !== null || state.result !== null;
  // A pasted user message is the request itself; every other type is a document the agent is asked about
  const isMessage = type.source === "user";
  const [request, setRequest] = useState(`Can you summarise this ${type.noun} for me?`);
  const [file, setFile] = useState<{ blob: Blob; name: string } | null>(null);
  const [ranAs, setRanAs] = useState<string | null>(null); // the name of what the agents read
  const [preparing, setPreparing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const runs = useAgentRuns();
  const busy = preparing || runs.running;

  useGSAP(() => {
    const step = root.current?.querySelector<HTMLElement>("[data-result]");
    if (!step) return;
    gsap.fromTo(step, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: duration(0.5), ease: "power3.out" });
    step.scrollIntoView({ behavior: duration(1) ? "smooth" : "instant", block: "start" });
  }, { dependencies: [checked], scope: root });

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
    setFile({ blob: file, name });
    const form = new FormData();
    form.append("file", file, name);
    return run(() => fetch(`${BASE_PATH}/api/check-file`, { method: "POST", body: form }));
  }

  async function checkExampleFile(name: string) {
    const response = await fetch(`${BASE_PATH}/examples/${name}`);
    await checkFile(await response.blob(), name);
  }

  // Both agents get the same input. A file's text is extracted once, with its hidden ranges, so the protected
  // agent's check reads it exactly as "Check this file" does.
  async function runBoth() {
    setRunError(null);
    if (isMessage) {
      setRanAs("Your message");
      return runs.start({ user_request: text, check_request: true });
    }
    let document: Record<string, unknown> = { text, source: type.source, format: type.format };
    if (type.form === "file" && file) {
      setPreparing(true);
      try {
        const form = new FormData();
        form.append("file", file.blob, file.name);
        const response = await fetch(`${BASE_PATH}/api/extract`, { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        if (!data.text?.trim()) throw new Error("No text could be found in this file.");
        document = { text: data.text, source: "document", format: "text", hidden: data.hidden ?? [] };
      } catch (error) {
        return setRunError(error instanceof Error ? error.message : "Could not read the file.");
      } finally {
        setPreparing(false);
      }
    }
    setRanAs(type.form === "file" && file ? file.name : `Your ${type.noun}`);
    return runs.start({ user_request: request, document });
  }

  const tooLong = isMessage && text.length > MAX_REQUEST;
  const ready = type.form === "file" ? file !== null : text.trim() !== "" && !tooLong;
  const runControls = (
    <>
      <button className="btn btn--primary" onClick={runBoth} disabled={busy || !ready || (!isMessage && !request.trim())}>
        {preparing ? "Reading the file…" : runs.running ? "Running…" : "Run both agents"}
      </button>
      {ranAs && <button className="btn" onClick={() => runs.setDrawerOpen(true)}>{runs.running ? "Watch the run" : "Open results"}</button>}
    </>
  );

  return (
    <div ref={root}>
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
              <label style={{ flexBasis: "100%" }}>
                <span className="label">You ask the agent about {file ? file.name : `the ${type.noun}`}</span>
                <input className="field" value={request} maxLength={MAX_REQUEST} onChange={(e) => setRequest(e.target.value)} />
              </label>
              {runControls}
              <details style={{ marginTop: "var(--space-6)", flexBasis: "100%" }}>
                <summary>Only extract the text from a file, without checking it</summary>
                <DocumentExtractor />
              </details>
            </div>
          ) : (
            <>
              <textarea className="field mono" rows={10} value={text} disabled={state.loading}
                placeholder={`Paste the ${type.noun} here`} onChange={(e) => setText(e.target.value)} />
              {tooLong && <p className={s.warn}>The agent takes a message of at most {MAX_REQUEST.toLocaleString()} characters.</p>}
              {!isMessage && (
                <label>
                  <span className="label">You ask the agent about it</span>
                  <input className="field" value={request} maxLength={MAX_REQUEST} onChange={(e) => setRequest(e.target.value)} />
                </label>
              )}
              <div className={s.chips}>
                {runControls}
                <button className="btn btn--ghost" onClick={checkText} disabled={state.loading || !text.trim()}>
                  Only check this {type.noun}
                </button>
                {type.example && (
                  <button className="btn btn--ghost" disabled={state.loading} onClick={() => setText(type.example!)}>
                    Load an example
                  </button>
                )}
              </div>
            </>
          )}
          {runError && <div className={s.error}>Could not start the agents: {runError}</div>}
        </div>
      </section>

      {checked && <section className={s.step} data-result>
        <StepHeader n={first + 1} title="What the firewall did"
          hint="The same checks as for every email: rules, two classifiers, the language gate, then the LLM judge and sandbox on anything flagged." />
        <div className={s.stepBody}>
          <EmailCheck state={state} noun={type.noun} />
        </div>
      </section>}

      {/* Beside the steps, never inside one: the result step is moved by GSAP, and a transform pins a fixed drawer */}
      {ranAs && (
        <RunDrawer open={runs.drawerOpen} onClose={runs.closeDrawer} title={`Same ${isMessage ? "message" : type.noun}, two agents`}
          subtitle={`${ranAs} · the tools are fake: nothing is really sent or paid · on the shared server the protected run takes a few minutes`}>
          <RunResults jobs={runs.jobs} seconds={runs.seconds} scenario={null} custom
            emails={[{ from: "", subject: ranAs, body: "" }]} reads={isMessage ? "request" : "document"} noun={isMessage ? "message" : type.noun} />
        </RunDrawer>
      )}
    </div>
  );
}
