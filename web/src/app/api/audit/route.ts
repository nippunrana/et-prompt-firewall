import { forward } from "@/lib/proxy";
import { FIREWALL_URL } from "@/lib/services";

export const dynamic = "force-dynamic";

export async function GET() {
  return forward(`${FIREWALL_URL}/audit?limit=100`);
}
