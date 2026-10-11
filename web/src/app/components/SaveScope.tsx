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

  return (
    <div className={s.scope}>
      <span className={s.scopeLabel}>Runs saved to</span>
      <div className={s.segmented} role="radiogroup" aria-label="Where new runs are saved">
        {SCOPES.map((x) => (
          <button key={x.key} role="radio" aria-checked={scope === x.key} title={x.title} className={s.segment}
            onClick={() => setScope(x.key)}>
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}
