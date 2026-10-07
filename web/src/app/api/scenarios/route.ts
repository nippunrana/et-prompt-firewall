import { forward } from "@/lib/proxy";
import { DEMO_AGENT_URL } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  return forward(`${DEMO_AGENT_URL}/scenarios`);
}
