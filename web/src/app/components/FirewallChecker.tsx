"use client";

import React, { useState } from "react";
import { BASE_PATH } from "@/lib/base-path";

interface Attack {
  types: string[];
  channel: string;
  span: [number, number];
  text: string;
  found_by: string[];
  confidence: string;
  rules: string[];
}

interface CheckResult {
  verdict: "allow" | "sanitise" | "quarantine";
  lane: string;
  risk: number | null;
  attacks: Attack[];
  hints: { rule: string; type: string; text: string }[];
  warnings: string[];
  clean_content: string | null;
  scores: Record<string, { whole: number; max_window: number }>;
  trace: { step: string; ms: number }[];
}

const SOURCES = [
  { value: "email", label: "Email" },
  { value: "document", label: "Document" },
  { value: "web", label: "Web page" },
  { value: "user", label: "User message" },
  { value: "", label: "Not given (treated as outside content)" },
];

const VERDICT_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  allow: { bg: "#dcfce7", text: "#15803d", label: "Allowed" },
  sanitise: { bg: "#fef3c7", text: "#b45309", label: "Sanitised (attack removed)" },
  quarantine: { bg: "#fee2e2", text: "#b91c1c", label: "Quarantined (held for review)" },
};

const box: React.CSSProperties = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: "8px",
  padding: "0.75rem 1rem",
  margin: 0,
  fontSize: "0.88rem",
  fontFamily: "monospace",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  color: "#1e293b",
  maxHeight: "22rem",
  overflowY: "auto",
};

const heading: React.CSSProperties = { fontSize: "0.95rem", fontWeight: 600, color: "#0f172a", margin: "1.25rem 0 0.5rem" };

const pretty = (s: string) => s.replace(/_/g, " ");

// The original text with every removed span marked, using the firewall's character offsets
function highlight(text: string, attacks: Attack[]) {
  const spans = [...attacks].sort((a, b) => a.span[0] - b.span[0]);
  const parts: React.ReactNode[] = [];
  let pos = 0;
  spans.forEach((a, i) => {
    parts.push(text.slice(pos, a.span[0]));
    parts.push(
      <mark key={i} title={a.types.map(pretty).join(", ")} style={{ background: "#fecaca", color: "#7f1d1d", borderRadius: "3px" }}>
        {text.slice(a.span[0], a.span[1])}
      </mark>
    );
    pos = a.span[1];
  });
  parts.push(text.slice(pos));
  return parts;
}

export default function FirewallChecker() {
  const [content, setContent] = useState("");
  const [source, setSource] = useState("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checkedText, setCheckedText] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [showJson, setShowJson] = useState(false);

  const runCheck = async (text: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    const start = performance.now();
    try {
      // Must use BASE_PATH: fetch() does not add it
      const response = await fetch(`${BASE_PATH}/api/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, source: source || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Check failed");
      setCheckedText(text);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred.");
    } finally {
      setElapsedMs(Math.round(performance.now() - start));
      setLoading(false);
    }
  };

  const recheckCleaned = () => {
    if (!result?.clean_content) return;
    setContent(result.clean_content);
    runCheck(result.clean_content);
  };

  const verdict = result ? VERDICT_STYLE[result.verdict] : null;

  return (
    <div
      style={{
        marginTop: "2.5rem",
        padding: "1.75rem",
        background: "#ffffff",
        borderRadius: "16px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
      }}
    >
      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, margin: "0 0 0.4rem 0", color: "#0f172a" }}>Firewall Check</h2>
      <p style={{ margin: "0 0 1rem 0", fontSize: "0.92rem", color: "#64748b" }}>
        Paste an email or any text. The firewall runs its rules, PIGuard and Prompt Guard 2, then removes what it finds. No LLM judge yet.
      </p>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={"From: someone@example.com\nSubject: ...\n\nPaste the email text here"}
        rows={12}
        style={{ ...box, width: "100%", boxSizing: "border-box", maxHeight: "none", resize: "vertical" }}
      />

      <div style={{ marginTop: "0.75rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
        <label style={{ fontSize: "0.9rem", color: "#334155" }}>
          Source:{" "}
          <select value={source} onChange={(e) => setSource(e.target.value)} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
            {SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <span style={{ fontSize: "0.8rem", color: content.length > 20000 ? "#dc2626" : "#94a3b8" }}>{content.length.toLocaleString()} / 20,000 characters</span>
        <button
          onClick={() => runCheck(content)}
          disabled={!content.trim() || loading}
          style={{
            padding: "0.65rem 1.5rem",
            background: !content.trim() || loading ? "#94a3b8" : "#2563eb",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "0.95rem",
            border: "none",
            borderRadius: "8px",
            cursor: !content.trim() || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Checking..." : "Check"}
        </button>
      </div>

      {error && (
        <div style={{ marginTop: "1.25rem", padding: "0.75rem 1rem", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: "8px", fontSize: "0.9rem" }}>
          ⚠️ <strong>Check Error:</strong> {error}
        </div>
      )}

      {result && verdict && (
        <div style={{ marginTop: "1.5rem", borderTop: "1px solid #e2e8f0", paddingTop: "1.25rem" }}>
          {/* Verdict banner */}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px", background: "#f8fafc", padding: "0.75rem 1rem", borderRadius: "10px", border: "1px solid #e2e8f0" }}>
            <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "0.9rem", fontWeight: 700, background: verdict.bg, color: verdict.text }}>{verdict.label}</span>
            <span style={{ fontSize: "0.85rem", color: "#475569" }}>
              Lane: <strong>{pretty(result.lane)}</strong>
            </span>
            <span style={{ fontSize: "0.85rem", color: "#475569" }}>
              Risk: <strong>{result.risk ?? "n/a"}</strong>
            </span>
            <span style={{ fontSize: "0.85rem", color: "#475569", marginLeft: "auto" }}>
              ⏱️ <strong>{(elapsedMs / 1000).toFixed(1)} s</strong>
            </span>
          </div>

          {result.warnings.length > 0 && (
            <div style={{ marginTop: "0.75rem", fontSize: "0.88rem", color: "#b45309" }}>⚠️ {result.warnings.join(" · ")}</div>
          )}

          {/* What was found */}
          <h3 style={heading}>Attacks removed ({result.attacks.length})</h3>
          {result.attacks.length === 0 && <p style={{ margin: 0, fontSize: "0.88rem", color: "#64748b" }}>None.</p>}
          {result.attacks.map((a, i) => (
            <div key={i} style={{ border: "1px solid #fecaca", background: "#fff7f7", borderRadius: "8px", padding: "0.6rem 0.9rem", marginBottom: "0.5rem", fontSize: "0.88rem" }}>
              <div style={{ fontWeight: 600, color: "#991b1b" }}>{a.types.map(pretty).join(", ")}</div>
              <div style={{ color: "#475569", margin: "0.2rem 0" }}>
                Found by: {a.found_by.join(", ")} · Confidence: {a.confidence} · Channel: {a.channel}
                {a.rules.length > 0 && <> · Rules: {a.rules.join(", ")}</>}
              </div>
              <div style={{ fontFamily: "monospace", color: "#7f1d1d" }}>&ldquo;{a.text}&rdquo;</div>
            </div>
          ))}

          {result.hints.length > 0 && (
            <>
              <h3 style={heading}>Weak hints (not removed)</h3>
              {result.hints.map((h, i) => (
                <div key={i} style={{ fontSize: "0.88rem", color: "#92400e", marginBottom: "0.3rem" }}>
                  {pretty(h.type)} ({h.rule}): <span style={{ fontFamily: "monospace" }}>&ldquo;{h.text}&rdquo;</span>
                </div>
              ))}
            </>
          )}

          <h3 style={heading}>Original, with removed parts highlighted</h3>
          <pre style={box}>{highlight(checkedText, result.attacks)}</pre>

          <h3 style={heading}>Cleaned text (what the AI would receive)</h3>
          {result.clean_content === null ? (
            <p style={{ margin: 0, fontSize: "0.88rem", color: "#b91c1c" }}>Nothing: the whole content is held for human review.</p>
          ) : (
            <>
              <pre style={box}>{result.clean_content}</pre>
              {result.verdict === "sanitise" && (
                <button
                  onClick={recheckCleaned}
                  disabled={loading}
                  style={{ marginTop: "0.5rem", padding: "6px 12px", fontSize: "0.85rem", fontWeight: 600, borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#334155", cursor: "pointer" }}
                >
                  🔁 Check the cleaned text again
                </button>
              )}
            </>
          )}

          {/* Scores and timings */}
          <h3 style={heading}>Classifier scores (0 = benign, 1 = attack)</h3>
          <table style={{ fontSize: "0.88rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ color: "#475569", textAlign: "left" }}>
                <th style={{ paddingRight: "2rem" }}>Model</th>
                <th style={{ paddingRight: "2rem" }}>Whole text</th>
                <th>Worst 3-sentence window</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(result.scores).map(([name, s]) => (
                <tr key={name}>
                  <td style={{ paddingRight: "2rem" }}>{name}</td>
                  <td style={{ paddingRight: "2rem" }}>{s.whole}</td>
                  <td>{s.max_window}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ fontSize: "0.82rem", color: "#64748b", margin: "0.75rem 0 0" }}>
            Steps: {result.trace.map((t) => `${t.step} ${t.ms} ms`).join(" → ")}
          </p>

          <button onClick={() => setShowJson(!showJson)} style={{ marginTop: "0.75rem", padding: "4px 10px", fontSize: "0.8rem", borderRadius: "6px", border: "1px solid #cbd5e1", background: "#ffffff", color: "#64748b", cursor: "pointer" }}>
            {showJson ? "Hide" : "Show"} raw JSON
          </button>
          {showJson && <pre style={{ ...box, marginTop: "0.5rem", color: "#0369a1" }}>{JSON.stringify(result, null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}
