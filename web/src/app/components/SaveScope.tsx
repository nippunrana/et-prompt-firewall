"use client";

import React, { useEffect, useState } from "react";
import { getScope, HISTORY_EVENT, setScope, type Scope } from "@/lib/run-history";
import s from "./shell.module.css";

const SCOPES: { key: Scope; label: string; title: string }[] = [
  { key: "local", label: "This browser", title: "New runs stay in this browser: no one else can see them. The audit log shows your runs." },
  { key: "public", label: "Everyone (server)", title: "New runs are saved on the server, text included, and anyone who opens this page can see them. The audit log shows everyone's shared runs." },
];

// Where new runs are saved, and so which runs the audit log shows. In the header so it is always in view before a run.
export default function SaveScope() {
  const [scope, setScopeState] = useState<Scope>("local");

  useEffect(() => {
    const load = () => setScopeState(getScope());
    load();
    window.addEventListener(HISTORY_EVENT, load);
    window.addEventListener("storage", load); // switched in another tab
    return () => {
      window.removeEventListener(HISTORY_EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const current = SCOPES.find((x) => x.key === scope)!;
  return (
    <label className={s.scope}>
      <span className={s.scopeLabel}>Runs saved to</span>
      <select className={s.select} value={scope} title={current.title} onChange={(e) => setScope(e.target.value as Scope)}>
        {SCOPES.map((x) => <option key={x.key} value={x.key} title={x.title}>{x.label}</option>)}
      </select>
    </label>
  );
}
