// Server-side only. The Python services have no host port; they are reachable only
// on the project's internal Docker network, by their Compose service names.
const FIREWALL_URL = "http://firewall:8000";
const DEMO_AGENT_URL = "http://demo-agent:8000";

async function getJson(url: string): Promise<Record<string, string> | null> {
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

export async function serviceStatus() {
  const [firewall, demoAgent] = await Promise.all([
    getJson(`${FIREWALL_URL}/health`),
    getJson(`${DEMO_AGENT_URL}/health`),
  ]);
  return {
    firewall: firewall?.status === "ok" ? "ok" : "down",
    demoAgent: demoAgent?.status === "ok" ? "ok" : "down",
  };
}

export async function databaseStatus(): Promise<string> {
  const result = await getJson(`${FIREWALL_URL}/health/database`);
  return result?.database ?? "unknown (firewall unreachable)";
}
