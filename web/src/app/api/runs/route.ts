import { forward } from "@/lib/proxy";
import { DEMO_AGENT_URL } from "@/lib/services";

export const dynamic = "force-dynamic";

// Starts an agent run in the background; the browser then polls /api/runs/<id>. A protected run can
// take minutes on the VPS, longer than Cloudflare waits for one response.
export async function POST(request: Request) {
  const body = await request.text();
  return forward(`${DEMO_AGENT_URL}/runs`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
}
