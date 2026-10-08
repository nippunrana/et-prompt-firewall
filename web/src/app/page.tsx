import { serviceStatus } from "@/lib/services";
import AgentDemo from "./components/AgentDemo";
import AppShell from "./components/AppShell";
import AuditLog from "./components/AuditLog";
import ContentCheck from "./components/ContentCheck";
import Dashboard from "./components/Dashboard";
import DocumentExtractor from "./components/DocumentExtractor";
import Hero from "./components/Hero";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/nippunrana/et-prompt-firewall";

export default async function Home() {
  const services = await serviceStatus();

  return (
    <AppShell
      repo={REPO}
      status={[["Web", "ok"], ["Firewall", services.firewall], ["Demo agent", services.demoAgent]]}
      views={[
        { label: "Try it", content: <><Hero /><AgentDemo /></> },
        {
          label: "Results",
          title: "Measured results",
          intro: <>Measured on data the firewall was never tuned on: public benchmarks (Microsoft&apos;s LLMail-Inject, agentic boundary pairs, Enron real email) plus sets we wrote, always shown apart. Run on a laptop with every layer on; the full method and per-item IDs are in <code>eval/results/</code> on GitHub.</>,
          content: <Dashboard />,
        },
        {
          label: "Audit log",
          title: "Audit log",
          intro: "No step waits for a person: the firewall decides on its own, and this log is how a person checks afterwards what it decided. Every content check and every action the agent tried is recorded, newest first. The checked text is never stored, only its length and a hash.",
          content: <AuditLog />,
        },
        {
          label: "Any input",
          title: "Check any input before the agent reads it",
          intro: "Pick what the content is. Each type has its own front end: an email's header block, a web page's hidden parts, a file's white, tiny or hidden text. Then every type goes through the same detectors. Text a person cannot see is checked as closely as the rest.",
          content: (
            <>
              <ContentCheck />
              <details style={{ marginTop: "var(--space-6)" }}>
                <summary>Only extract the text from a file, without checking it</summary>
                <DocumentExtractor />
              </details>
            </>
          ),
        },
      ]}
    />
  );
}
