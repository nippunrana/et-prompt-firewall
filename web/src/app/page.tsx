import AppShell from "./components/AppShell";
import AuditLog from "./components/AuditLog";
import Dashboard from "./components/Dashboard";
import TryIt from "./components/TryIt";

export const dynamic = "force-dynamic";

const REPO = "https://github.com/nippunrana/et-prompt-firewall";

export default function Home() {
  return (
    <AppShell
      repo={REPO}
      views={[
        { label: "Try it", content: <TryIt /> },
        {
          label: "Results",
          title: "Measured results",
          intro: <>Measured on data the firewall was never tuned on: public benchmarks (Microsoft&apos;s LLMail-Inject, agentic boundary pairs, Enron real email) plus sets we wrote, always shown apart. The headline numbers use only public data no classifier here was trained on; LLMail-Inject is in Wolf Defender&apos;s training data, so it is shown apart too. Run on a laptop with every layer on; the full method and per-item IDs are in <code>eval/results/</code> on GitHub.</>,
          content: <Dashboard />,
        },
        {
          label: "Audit log",
          title: "Audit log",
          intro: "No step waits for a person: this record is how you check afterwards what the firewall decided, and why. Every run of the two agents is kept whole. Open one to see how each agent ended, a timeline of every step, what ran and what failed, then every check and action. A prototype with no database, by design: you choose where each run is saved with “Runs saved to” at the top of every page. In this browser, the default, no one else can see it; for everyone, it goes to a shared file on the server, text included. The firewall's own decision log keeps verdicts and reasons, never the checked text.",
          content: <AuditLog />,
        },
      ]}
    />
  );
}
