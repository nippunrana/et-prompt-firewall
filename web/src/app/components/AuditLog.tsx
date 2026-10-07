"use client";

import React, { useCallback, useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/base-path";

interface Entry {
  time: string;
  checkpoint: "check" | "guard";
  verdict: string;
  types: string[];
  source?: string;
  lane?: string;
  cuts?: number;
  found_by?: string[];
  content_chars?: number;
  tool?: string;
  reason?: string;
}

const pretty = (s: string) => s.replace(/_/g, " ");
const th: React.CSSProperties = { textAlign: "left", padding: "0.4rem 0.6rem", color: "#475569", fontWeight: 600, borderBottom: "1px solid #e2e8f0" };
const td: React.CSSProperties = { padding: "0.4rem 0.6rem", borderBottom: "1px solid #f1f5f9", verticalAlign: "top" };
const VERDICT_COLOUR: Record<string, string> = { allow: "#15803d", sanitise: "#b45309", quarantine: "#b91c1c", block: "#b91c1c" };

export default function AuditLog() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await (await fetch(`${BASE_PATH}/api/audit`)).json();
      if (data.error) throw new Error(data.error);
      setEntries(data.entries);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the audit log.");
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <p style={{ margin: "0 0 1rem", fontSize: "0.92rem", color: "#475569" }}>
        No step waits for a person: the firewall decides on its own, and this log is how a person checks afterwards what it decided.
        Every content check and every outgoing action the agent tried is recorded, newest first. The checked text itself is never stored, only its length and a hash.
      </p>
      <button onClick={load} style={{ padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600, borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#334155", cursor: "pointer", marginBottom: "0.75rem" }}>
        Refresh
      </button>
      {error && <p style={{ color: "#b91c1c" }}>{error}</p>}
      {entries && entries.length === 0 && <p style={{ color: "#64748b" }}>No decisions yet. Run a check or the agent demo.</p>}
      {entries && entries.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", fontSize: "0.85rem", width: "100%" }}>
            <thead>
              <tr><th style={th}>Time</th><th style={th}>Checkpoint</th><th style={th}>What</th><th style={th}>Decision</th><th style={th}>Attack types</th><th style={th}>Why</th></tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td style={{ ...td, whiteSpace: "nowrap", color: "#64748b" }}>{e.time.replace("T", " ").slice(0, 19)}</td>
                  <td style={td}>{e.checkpoint === "check" ? "1 · content" : "2 · action"}</td>
                  <td style={td}>{e.checkpoint === "check" ? `${e.source} content, ${e.content_chars?.toLocaleString()} chars` : e.tool}</td>
                  <td style={{ ...td, fontWeight: 600, color: VERDICT_COLOUR[e.verdict] ?? "#0f172a" }}>{e.verdict}</td>
                  <td style={td}>{e.types.map(pretty).join(", ") || "–"}</td>
                  <td style={{ ...td, color: "#475569" }}>
                    {e.checkpoint === "check"
                      ? `lane ${e.lane}${e.cuts ? `, ${e.cuts} cut${e.cuts > 1 ? "s" : ""} by ${e.found_by?.join(", ")}` : ""}`
                      : e.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
