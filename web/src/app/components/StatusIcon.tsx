import React from "react";

export type Alert = "blocked" | "unsafe" | "stopped";

const LABEL: Record<Alert, string> = { blocked: "Blocked", unsafe: "Unsafe action", stopped: "Protected" };

// Shape carries the meaning as well as colour, for readers who cannot tell red from green:
// a stop sign for a blocked action, a warning triangle for an unsafe one that ran, a shield for a stopped attack.
export default function StatusIcon({ kind, size = 20 }: { kind: Alert; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" role="img" aria-label={LABEL[kind]} style={{ flex: "none" }}>
      {kind === "blocked" && (
        <>
          <polygon points="6,1 14,1 19,6 19,14 14,19 6,19 1,14 1,6" fill="var(--block)" />
          <rect x="5" y="8.75" width="10" height="2.5" rx="1" fill="#fff" />
        </>
      )}
      {kind === "unsafe" && (
        <>
          <path d="M10 1.5 19 18H1Z" fill="var(--block)" strokeLinejoin="round" />
          <rect x="9" y="7" width="2" height="6" rx="1" fill="#fff" />
          <circle cx="10" cy="15.2" r="1.1" fill="#fff" />
        </>
      )}
      {kind === "stopped" && (
        <>
          <path d="M10 1.5 17 4v5.5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V4Z" fill="var(--allow)" />
          <path d="m6.5 10 2.4 2.4 4.9-4.9" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
