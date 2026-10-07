"use client";

import React, { useState } from "react";

// Every panel stays mounted, so a running agent demo keeps polling while another tab is open.
export default function Tabs({ tabs }: { tabs: { label: string; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div role="tablist" style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid #e2e8f0", margin: "1.5rem 0 1.25rem", flexWrap: "wrap" }}>
        {tabs.map((t, i) => (
          <button key={t.label} role="tab" aria-selected={i === active} onClick={() => setActive(i)}
            style={{ padding: "0.6rem 1rem", border: "none", background: "none", cursor: "pointer", fontSize: "0.95rem",
              fontWeight: i === active ? 700 : 500, color: i === active ? "#1d4ed8" : "#475569",
              borderBottom: `2px solid ${i === active ? "#2563eb" : "transparent"}`, marginBottom: "-1px" }}>
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.label} role="tabpanel" hidden={i !== active}>{t.content}</div>
      ))}
    </div>
  );
}
