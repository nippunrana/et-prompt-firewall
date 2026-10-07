import { forward } from "@/lib/proxy";
import { DEMO_AGENT_URL } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return forward(`${DEMO_AGENT_URL}/runs/${encodeURIComponent(id)}`);
}
