import { NextResponse } from "next/server";

// Server-side only: passes a request on to a Python service on the internal Docker network and
// returns its JSON answer, with FastAPI's error detail flattened into `error`.
export async function forward(url: string, init: RequestInit = {}, timeoutMs = 15000) {
  try {
    const response = await fetch(url, { cache: "no-store", ...init, signal: AbortSignal.timeout(timeoutMs) });
    const data = await response.json();
    if (!response.ok) {
      const detail = Array.isArray(data.detail) ? data.detail.map((d: { msg: string }) => d.msg).join("; ") : data.detail;
      return NextResponse.json({ error: detail || "Request failed" }, { status: response.status });
    }
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Service unavailable: ${message}` }, { status: 502 });
  }
}
