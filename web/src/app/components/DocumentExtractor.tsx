"use client";

import React, { useState, useRef, ChangeEvent, DragEvent } from "react";
import { BASE_PATH } from "@/lib/base-path";

interface ExtractionResult {
  status: string;
  filename: string;
  method: string;
  page_count: number;
  text: string;
  duration_seconds?: number;
  duration_ms?: number;
  error?: string;
}

export default function DocumentExtractor() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"rendered" | "raw" | "json">("rendered");
  const [copied, setCopied] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const handleExtract = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);

    const startTime = performance.now();

    try {
      // Must use BASE_PATH for subpath hosting as per project specifications
      const response = await fetch(`${BASE_PATH}/api/extract`, {
        method: "POST",
        body: formData,
      });

      const clientElapsedMs = Math.round(performance.now() - startTime);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Extraction failed");
      }

      if (!data.duration_ms) {
        data.duration_ms = clientElapsedMs;
        data.duration_seconds = +(clientElapsedMs / 1000).toFixed(3);
      }

      setResult(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyText = async () => {
    if (!result?.text) return;
    try {
      await navigator.clipboard.writeText(result.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const renderFormattedMarkdown = (text: string) => {
    if (!text) return null;

    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let tableBuffer: string[] = [];

    const flushTable = (keyIndex: number) => {
      if (tableBuffer.length === 0) return;

      const rows = tableBuffer.map((line) =>
        line
          .split("|")
          .map((c) => c.trim())
          .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
      );

      // Filter out markdown divider rows like | --- | --- |
      const cleanRows = rows.filter(
        (row) => !row.every((cell) => cell.replace(/-/g, "").length === 0)
      );

      if (cleanRows.length > 0) {
        const header = cleanRows[0];
        const bodyRows = cleanRows.slice(1);

        elements.push(
          <div key={`table-${keyIndex}`} style={{ overflowX: "auto", margin: "1.2rem 0" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
                borderRadius: "8px",
                overflow: "hidden",
                border: "1px solid #e2e8f0",
              }}
            >
              {header && (
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #cbd5e1" }}>
                    {header.map((col, idx) => (
                      <th
                        key={idx}
                        style={{
                          padding: "8px 12px",
                          textAlign: "left",
                          fontWeight: 600,
                          color: "#1e293b",
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
              )}
              <tbody>
                {bodyRows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: rIdx % 2 === 0 ? "#ffffff" : "#fdfefe",
                    }}
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        style={{
                          padding: "8px 12px",
                          color: "#334155",
                        }}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      tableBuffer = [];
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();

      if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
        tableBuffer.push(trimmed);
      } else {
        flushTable(idx);

        if (trimmed.startsWith("### ")) {
          elements.push(
            <h3 key={idx} style={{ fontSize: "1.1rem", fontWeight: 600, marginTop: "1rem", color: "#0f172a" }}>
              {trimmed.slice(4)}
            </h3>
          );
        } else if (trimmed.startsWith("## ")) {
          elements.push(
            <h2 key={idx} style={{ fontSize: "1.25rem", fontWeight: 600, marginTop: "1.2rem", color: "#0f172a" }}>
              {trimmed.slice(3)}
            </h2>
          );
        } else if (trimmed.startsWith("# ")) {
          elements.push(
            <h1 key={idx} style={{ fontSize: "1.4rem", fontWeight: 700, marginTop: "1.4rem", color: "#0f172a" }}>
              {trimmed.slice(2)}
            </h1>
          );
        } else if (trimmed.startsWith("--- ")) {
          elements.push(
            <div
              key={idx}
              style={{
                fontSize: "0.8rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                color: "#64748b",
                fontWeight: 600,
                marginTop: "1.2rem",
                paddingBottom: "4px",
                borderBottom: "1px dashed #cbd5e1",
              }}
            >
              {trimmed.replace(/-/g, "").trim()}
            </div>
          );
        } else if (trimmed.length > 0) {
          elements.push(
            <p key={idx} style={{ margin: "0.4rem 0", lineHeight: 1.5, color: "#334155" }}>
              {trimmed}
            </p>
          );
        }
      }
    });

    flushTable(lines.length);
    return elements;
  };

  const getMethodBadgeColor = (method: string) => {
    switch (method) {
      case "image_ocr":
        return { bg: "#e0f2fe", text: "#0369a1", label: "Image OCR (PP-OCRv4)" };
      case "digital_pdf":
        return { bg: "#dcfce7", text: "#15803d", label: "Digital PDF (Fast Vector)" };
      case "scanned_pdf_ocr":
        return { bg: "#fef3c7", text: "#b45309", label: "Scanned PDF (RapidOCR)" };
      case "word_docx":
        return { bg: "#ede9fe", text: "#6d28d9", label: "Word (.docx) XML Native" };
      case "excel_xlsx":
        return { bg: "#f0fdf4", text: "#166534", label: "Excel (.xlsx) Table Native" };
      case "csv":
        return { bg: "#f0fdf4", text: "#166534", label: "CSV Table Native" };
      default:
        return { bg: "#f1f5f9", text: "#475569", label: method };
    }
  };

  return (
    <div
      style={{
        padding: "1.75rem",
        background: "#ffffff",
        borderRadius: "16px",
        border: "1px solid #e2e8f0",
        boxShadow: "0 4px 20px -2px rgba(0, 0, 0, 0.05)",
      }}
    >
      {/* Dropzone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? "#3b82f6" : "#cbd5e1"}`,
          borderRadius: "12px",
          padding: "2rem 1.5rem",
          textAlign: "center",
          background: isDragging ? "#eff6ff" : "#f8fafc",
          cursor: "pointer",
          transition: "all 0.2s ease",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.webp,.tiff,.bmp,.pdf,.docx,.xlsx,.csv"
          onChange={handleFileChange}
          style={{ display: "none" }}
          id="file-upload-input"
        />

        <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📁</div>
        <p style={{ margin: "0 0 0.3rem 0", fontWeight: 600, color: "#1e293b", fontSize: "1rem" }}>
          {file ? file.name : "Click to browse or drag & drop a document here"}
        </p>
        <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b" }}>
          Supported: PNG, JPG, WEBP, TIFF, PDF (scanned or digital), Word (.docx), Excel (.xlsx), CSV
        </p>

        {file && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "0.75rem",
              padding: "4px 12px",
              background: "#e2e8f0",
              borderRadius: "20px",
              fontSize: "0.85rem",
              color: "#334155",
            }}
          >
            <span>📄 {file.name}</span>
            <span style={{ color: "#64748b" }}>({formatFileSize(file.size)})</span>
          </div>
        )}
      </div>

      {/* Action Button */}
      <div style={{ marginTop: "1rem", display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={handleExtract}
          disabled={!file || loading}
          id="extract-submit-button"
          style={{
            padding: "0.65rem 1.5rem",
            background: !file || loading ? "#94a3b8" : "#0d0f14",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "0.95rem",
            border: "none",
            borderRadius: "8px",
            cursor: !file || loading ? "not-allowed" : "pointer",
            transition: "background 0.2s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {loading && (
            <span
              style={{
                display: "inline-block",
                width: "14px",
                height: "14px",
                border: "2px solid #ffffff",
                borderTopColor: "transparent",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
              }}
            />
          )}
          {loading ? "Extracting..." : "Extract Text & Tables"}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div
          style={{
            marginTop: "1.25rem",
            padding: "0.75rem 1rem",
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: "8px",
            fontSize: "0.9rem",
          }}
        >
          ⚠️ <strong>Extraction Error:</strong> {error}
        </div>
      )}

      {/* Results View */}
      {result && (
        <div
          style={{
            marginTop: "1.5rem",
            borderTop: "1px solid #e2e8f0",
            paddingTop: "1.25rem",
          }}
        >
          {/* Metadata Banner */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#f8fafc",
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              border: "1px solid #e2e8f0",
              marginBottom: "1rem",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span
                style={{
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  background: getMethodBadgeColor(result.method).bg,
                  color: getMethodBadgeColor(result.method).text,
                }}
              >
                {getMethodBadgeColor(result.method).label}
              </span>
              <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
                Pages: <strong>{result.page_count}</strong>
              </span>
            </div>

            {/* Dual Time Metric Display: seconds AND milliseconds */}
            <div
              style={{
                fontSize: "0.9rem",
                fontWeight: 600,
                color: "#0f172a",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              <span>⏱️ Latency:</span>
              <span style={{ color: "#0d0f14" }}>{result.duration_seconds} s</span>
              <span style={{ color: "#64748b", fontWeight: 400 }}>({result.duration_ms} ms)</span>
            </div>
          </div>

          {/* Tab Selector & Copy Button */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              borderBottom: "1px solid #e2e8f0",
              paddingBottom: "0.5rem",
            }}
          >
            <div style={{ display: "flex", gap: "6px" }}>
              {(["rendered", "raw", "json"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: "6px 12px",
                    fontSize: "0.85rem",
                    fontWeight: 600,
                    borderRadius: "6px",
                    border: "none",
                    cursor: "pointer",
                    background: activeTab === tab ? "#0f172a" : "transparent",
                    color: activeTab === tab ? "#ffffff" : "#64748b",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab === "rendered" ? "Rendered Content" : tab === "raw" ? "Raw Text" : "JSON Response"}
                </button>
              ))}
            </div>

            <button
              onClick={handleCopyText}
              style={{
                padding: "5px 12px",
                fontSize: "0.82rem",
                fontWeight: 600,
                borderRadius: "6px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                color: copied ? "#16a34a" : "#334155",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {copied ? "✓ Copied!" : "📋 Copy Text"}
            </button>
          </div>

          {/* Tab Content */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              padding: "1rem",
              maxHeight: "28rem",
              overflowY: "auto",
            }}
          >
            {activeTab === "rendered" && (
              <div>
                {result.text ? (
                  renderFormattedMarkdown(result.text)
                ) : (
                  <p style={{ color: "#94a3b8", fontStyle: "italic", margin: 0 }}>No text extracted.</p>
                )}
              </div>
            )}

            {activeTab === "raw" && (
              <pre
                style={{
                  margin: 0,
                  fontSize: "0.88rem",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "#1e293b",
                }}
              >
                {result.text}
              </pre>
            )}

            {activeTab === "json" && (
              <pre
                style={{
                  margin: 0,
                  fontSize: "0.85rem",
                  fontFamily: "var(--font-mono)",
                  whiteSpace: "pre-wrap",
                  color: "#0369a1",
                }}
              >
                {JSON.stringify(result, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      {/* Global Inline Keyframes for Loading Spinner */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
