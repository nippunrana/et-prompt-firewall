import { serviceStatus } from "@/lib/services";

export const dynamic = "force-dynamic";

// Docker's healthcheck for `web` and the deploy script both rely on this: 200 only when
// web can reach both Python services over the internal network. No database check here.
export async function GET() {
  const services = await serviceStatus();
  const healthy = services.firewall === "ok" && services.demoAgent === "ok";
  return Response.json(
    { web: "ok", ...services },
    { status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
