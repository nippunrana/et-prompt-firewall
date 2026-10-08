import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const FIREWALL_URL = process.env.FIREWALL_URL || "http://firewall:8000";

// A file checked the way the agent would read it: the firewall extracts it (marking hidden text), then checks it.
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ error: "No valid file uploaded" }, { status: 400 });
    }

    const forwardData = new FormData();
    forwardData.append("file", file, (file as File).name || "upload");
    const response = await fetch(`${FIREWALL_URL}/check-file`, {
      method: "POST",
      body: forwardData,
      // Extraction plus a full check with the LLM layers: about as long as a text check
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json();

    if (!response.ok) {
      const detail = Array.isArray(data.detail) ? data.detail.map((d: { msg: string }) => d.msg).join("; ") : data.detail;
      return NextResponse.json({ error: detail || "Check failed" }, { status: response.status });
    }
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Firewall service unavailable: ${message}` }, { status: 502 });
  }
}
