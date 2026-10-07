import { serviceStatus } from "@/lib/services";
import AgentDemo from "./components/AgentDemo";
import AuditLog from "./components/AuditLog";
import Dashboard from "./components/Dashboard";
import DocumentExtractor from "./components/DocumentExtractor";
import FirewallChecker from "./components/FirewallChecker";
import Tabs from "./components/Tabs";

export const dynamic = "force-dynamic";

export default async function Home() {
  const services = await serviceStatus();
  const rows: [string, string][] = [
    ["Web", "ok"],
    ["Firewall", services.firewall],
    ["Demo agent", services.demoAgent],
  ];

  return (
    <main>
      <h1 style={{ marginBottom: "0.3rem" }}>ET Prompt Firewall</h1>
      <p style={{ margin: 0, color: "#475569" }}>
        A prompt injection firewall that sits in front of an AI agent. It checks everything the agent reads, removes hidden
        instructions and names the attack, then checks every action the agent tries to take.
      </p>
      <p style={{ fontSize: "0.85rem", color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "0.5rem 0.75rem" }}>
        This live demo runs on a shared server, in Docker capped at 1 CPU and 2.5 GB of memory for the firewall, so checks are slow
        here (a protected agent run can take several minutes). For full speed, run it on your own machine: see the README on GitHub.
      </p>
      <div style={{ display: "flex", gap: "1.25rem", fontSize: "0.82rem", color: "#475569" }}>
        {rows.map(([name, status]) => (
          <span key={name}>{name}: <strong style={{ color: status === "ok" ? "#16a34a" : "#dc2626" }}>{status}</strong></span>
        ))}
      </div>

      <Tabs tabs={[
        { label: "Agent demo", content: <AgentDemo /> },
        { label: "Check content", content: <><FirewallChecker /><DocumentExtractor /></> },
        { label: "Results", content: <Dashboard /> },
        { label: "Audit log", content: <AuditLog /> },
      ]} />
    </main>
  );
}
