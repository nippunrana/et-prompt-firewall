import s from "./demo.module.css";

// What the product does, in one line, and where the two checkpoints sit.
export default function Hero() {
  return (
    <section className={s.hero}>
      <p className={s.eyebrow}>Prompt injection firewall for AI agents</p>
      <h1 className={s.headline}>Stop hidden instructions before your AI agent acts on them.</h1>
      <p className={s.lede}>
        The firewall checks every email the agent reads and every action it tries to take. Hide an attack in the inbox
        below, then run the same agent with and without the firewall.
      </p>
      <ol className={s.flow} aria-label="Where the firewall sits">
        <li className={s.flowNode}>Email</li>
        <li className={s.flowGate}>
          <strong>1 · Content check</strong>
          <span>Removes hidden instructions and names the attack</span>
        </li>
        <li className={s.flowNode}>AI agent</li>
        <li className={s.flowGate}>
          <strong>2 · Action guard</strong>
          <span>Blocks sends, forwards and payments you did not ask for</span>
        </li>
        <li className={s.flowNode}>Tools</li>
      </ol>
    </section>
  );
}
