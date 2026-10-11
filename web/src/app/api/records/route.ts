import { forward } from "@/lib/proxy";
import { DEMO_AGENT_URL } from "@/lib/services";

export const dynamic = "force-dynamic";

// Run records shared with everyone; a record saved locally never comes here
export async function GET() {
  return forward(`${DEMO_AGENT_URL}/records`);
}

export async function POST(request: Request) {
  const body = await request.text();
  return forward(`${DEMO_AGENT_URL}/records`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
}
