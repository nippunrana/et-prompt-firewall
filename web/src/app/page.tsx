import { databaseStatus, serviceStatus } from "@/lib/services";

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
      <table>
        <tbody>
          {rows.map(([name, status]) => (
            <tr key={name}>
              <td style={{ paddingRight: "2rem" }}>{name}</td>
              <td>{status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
