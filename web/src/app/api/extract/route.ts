import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FIREWALL_URL = process.env.FIREWALL_URL || "http://firewall:8000";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No valid file uploaded" }, { status: 400 });
    }

    const forwardData = new FormData();
    forwardData.append("file", file, (file as File).name || "upload");

    const clientStart = Date.now();
    const response = await fetch(`${FIREWALL_URL}/extract-text`, {
      method: "POST",
      body: forwardData,
      signal: AbortSignal.timeout(60000),
    });

    const clientDurationMs = Date.now() - clientStart;
    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.detail || data.error || "Failed to extract text" },
        { status: response.status }
      );
    }

    // Attach total round-trip timing if not already present
    if (!data.duration_ms) {
      data.duration_ms = clientDurationMs;
      data.duration_seconds = +(clientDurationMs / 1000).toFixed(3);
    }

    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Firewall service unavailable: ${message}` },
      { status: 502 }
    );
  }
}
