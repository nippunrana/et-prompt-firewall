import s from "./demo.module.css";

// What the product does, in one line, and where the two checkpoints sit.
export default function Hero() {
  return (
    <section className={s.hero}>
      <p className={s.eyebrow}>Prompt injection firewall for AI agents</p>
      <h1 className={s.headline}>Stop hidden instructions before your AI agent acts on them.</h1>
      <p className={s.lede}>
        The firewall checks everything the agent reads (emails, web pages, PDFs, Word files, images, messages) and every
        action it tries to take. Pick what the agent reads below: hide an attack in an inbox and run the same agent with and
        without the firewall, or check a web page or a file on its own.
      </p>
      <ol className={s.flow} aria-label="Where the firewall sits">
        <li className={s.flowNode}>Email, web, files</li>
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
