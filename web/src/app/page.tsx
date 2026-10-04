import { databaseStatus, serviceStatus } from "@/lib/services";
import DocumentExtractor from "./components/DocumentExtractor";
import FirewallChecker from "./components/FirewallChecker";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [services, database] = await Promise.all([serviceStatus(), databaseStatus()]);
  const rows: [string, string][] = [
    ["Web", "ok"],
    ["Firewall", services.firewall],
    ["Demo agent", services.demoAgent],
    ["Database", database],
  ];

  return (
    <main>
      <h1>ET Prompt Firewall</h1>
      <p>A prompt injection firewall that sits in front of an AI agent. In development.</p>

      <div style={{ background: "#f8fafc", padding: "1rem", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "0.95rem", color: "#475569" }}>System Health</h3>
        <table>
          <tbody>
            {rows.map(([name, status]) => (
              <tr key={name}>
                <td style={{ paddingRight: "2rem", fontSize: "0.9rem" }}>{name}</td>
                <td style={{ fontSize: "0.9rem", fontWeight: 600, color: status === "ok" ? "#16a34a" : "#dc2626" }}>
                  {status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <FirewallChecker />

      <DocumentExtractor />
    </main>
  );
}
