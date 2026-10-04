import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FIREWALL_URL = process.env.FIREWALL_URL || "http://firewall:8000";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const response = await fetch(`${FIREWALL_URL}/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: body.content, source: body.source ?? null }),
      // Long text is scored window by window; the firewall's own limit keeps it under this
      signal: AbortSignal.timeout(120000),
    });

    const data = await response.json();

    if (!response.ok) {
      // FastAPI validation errors arrive as a list under `detail`
      const detail = Array.isArray(data.detail) ? data.detail.map((d: { msg: string }) => d.msg).join("; ") : data.detail;
      return NextResponse.json({ error: detail || "Check failed" }, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Firewall service unavailable: ${message}` }, { status: 502 });
  }
}
