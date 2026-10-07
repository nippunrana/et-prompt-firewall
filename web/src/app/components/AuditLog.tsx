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
      <button className="btn" onClick={load} style={{ marginBottom: "var(--space-4)" }}>Refresh</button>
      {error && <p style={{ color: "var(--block)" }}>{error}</p>}
      {entries && entries.length === 0 && <p className="muted">No decisions yet. Check an email or run the agents on the Try it page.</p>}
      {entries && entries.length > 0 && (
        <div className="table-wrap card">
          <table className="table">
            <thead>
              <tr><th>Time</th><th>Checkpoint</th><th>What</th><th>Decision</th><th>Attack types</th><th>Why</th></tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={i}>
                  <td className="muted num" style={{ whiteSpace: "nowrap" }}>{e.time.replace("T", " ").slice(0, 19)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{e.checkpoint === "check" ? "1 · content" : "2 · action"}</td>
                  <td>{e.checkpoint === "check" ? `${e.source} content, ${e.content_chars?.toLocaleString()} chars` : e.tool}</td>
                  <td><span className={`pill pill--${e.verdict}`}>{e.verdict}</span></td>
                  <td>{e.types.map(pretty).join(", ") || "–"}</td>
                  <td className="muted">
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
