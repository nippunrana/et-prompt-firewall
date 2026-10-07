// One email's firewall check as seven stations, in the order the firewall runs them
// (services/firewall/app/check.py): rules, the two classifiers, the language gate, then the judge and
// the sandbox (in parallel, only for content the detectors did not pass), then the re-check of the cut text.
import { pretty, type Layers } from "./demo-types";

// flag: the layer raised a signal · hint: a weak signal, left to the judge · clear: ran, found nothing
// skip: did not run, by design · off: should have run but could not (no API key, or it failed)
export type StationState = "flag" | "hint" | "clear" | "skip" | "off";

export interface Station {
  key: string;
  name: string;
  value: string; // short, shown under the dot
  state: StationState;
  detail: string; // the caption shown when the dot is pointed at
  ms: number; // how long the layer took, to pace the animation
}

const OUTGOING = new Set(["send_email", "forward_email", "make_payment", "http_request", "run_shell_command", "delete_file"]);
const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
const CLASSIFIERS = [
  { key: "PIGuard", name: "PIGuard", about: "PIGuard, a classifier trained to spot prompt injections" },
  { key: "PromptGuard2", name: "Prompt Guard 2", about: "Llama Prompt Guard 2 86M, Meta's prompt-injection classifier" },
];

export function stations(l: Layers, lane: string | undefined): Station[] {
  const trace = (step: string) => l.trace.filter((t) => t.step === step);
  const ms = (step: string) => trace(step).reduce((sum, t) => sum + t.ms, 0);
  const raised = new Set([...l.attacks, ...l.cleared].flatMap((a) => a.found_by));
  const clearedOnly = (by: string) => l.cleared.some((c) => c.found_by.includes(by)) && !l.attacks.some((a) => a.found_by.includes(by));
  const llmSkipped = lane === "clean";
  const classifiersFailed = Boolean(trace("classifiers")[0]?.failed);

  const hits = Number(trace("rules")[0]?.hits ?? 0);
  const rules: Station = raised.has("rules")
    ? { key: "rules", name: "Rules", value: plural(hits, "match", "matches"), state: "flag", ms: ms("rules"),
        detail: `Pattern rules matched ${plural(hits, "time")}: known injection phrasing, hidden text or encoded instructions.${clearedOnly("rules") ? " The judge then cleared it." : ""}` }
    : l.hints.length
      ? { key: "rules", name: "Rules", value: "weak hint", state: "hint", ms: ms("rules"),
          detail: `A weak pattern (${[...new Set(l.hints.map((h) => pretty(h.type)))].join(", ")}): never cut on its own, so the judge settles it.` }
      : { key: "rules", name: "Rules", value: "none", state: "clear", ms: ms("rules"),
          detail: "No known injection phrasing, hidden text or encoded instruction." };

  const classifiers = CLASSIFIERS.map((c): Station => {
    const sc = l.scores[c.key];
    if (classifiersFailed || !sc) {
      return { key: c.key, name: c.name, value: "failed", state: "off", ms: 0,
        detail: `${c.about}, could not score this email, so the firewall decided on the rules and kept checking.` };
    }
    const scored = `scored the worst 3-sentence window ${sc.max_window.toFixed(2)} and the whole email ${sc.whole.toFixed(2)}`;
    // Not flagging a part is not the same as scoring low: the whole text can cross the threshold while no window does
    const verdict = !raised.has(c.key) ? "It flagged no part of the email." : clearedOnly(c.key) ? "Flagged, but the judge read it and cleared it." : "Flagged.";
    return { key: c.key, name: c.name, value: Math.max(sc.whole, sc.max_window).toFixed(2), state: raised.has(c.key) ? "flag" : "clear",
      ms: c.key === "PIGuard" ? ms("classifiers") : 0, detail: `${c.about}, ${scored}. ${verdict} Both classifiers took ${ms("classifiers")} ms together.` };
  });

  const langs = [...new Set(l.non_english_spans.map((s) => s.language))];
  const language: Station = langs.length
    ? { key: "lid", name: "Language", value: plural(l.non_english_spans.length, "line"), state: "hint", ms: ms("lid"),
        detail: `GlotLID found ${plural(l.non_english_spans.length, "non-English line")} (${langs.join(", ")}). The classifiers are trained on English, so the gate sends the email to the judge. It never cuts.` }
    : { key: "lid", name: "Language", value: "English", state: "clear", ms: ms("lid"),
        detail: "GlotLID found only English, so no instruction is hiding in a language the classifiers cannot read." };

  const notRun = (key: string, name: string, what: string): Station => llmSkipped
    ? { key, name, value: "skipped", state: "skip", ms: 0, detail: `Not called: the rules and classifiers found nothing, so ${what} made no LLM call.` }
    : { key, name, value: "unavailable", state: "off", ms: 0, detail: `Not available on this server (no API key), so the firewall decided without ${what}'s vote.` };

  const j = l.judge;
  const judge: Station = !j ? notRun("judge", "Judge", "the judge")
    : !j.ok ? { key: "judge", name: "Judge", value: "failed", state: "off", ms: ms("judge"), detail: `The LLM judge did not answer (${j.error ?? "no reason given"}), so the firewall decided without its vote.` }
    : j.took_over ? { key: "judge", name: "Judge", value: "taken over", state: "flag", ms: ms("judge"), detail: "The email steered the LLM judge: it returned the wrong check code. That alone blocks the email." }
    : j.is_attack ? { key: "judge", name: "Judge", value: "attack", state: "flag", ms: ms("judge"),
        detail: `LLM judge (Gemma 4): ${j.reason}${j.types.length ? ` · ${j.types.map(pretty).join(", ")}` : ""}` }
    : { key: "judge", name: "Judge", value: "safe", state: "clear", ms: ms("judge"),
        detail: `LLM judge (Gemma 4): ${j.reason} It can settle weak signals, but never clears a strong one.` };

  const sb = l.sandbox;
  // Name the call that would have done the most harm: sending, paying or running beats reading invoices
  const worst = sb?.calls.find((c) => OUTGOING.has(c.name)) ?? sb?.calls[0];
  const tried = sb?.calls.map((c) => `${c.name}${c.args.to || c.args.recipient ? ` → ${c.args.to || c.args.recipient}` : ""}`).join(", ");
  const sandbox: Station = !sb ? notRun("sandbox", "Sandbox", "the sandbox")
    : !sb.ok ? { key: "sandbox", name: "Sandbox", value: "failed", state: "off", ms: ms("sandbox"), detail: `The sandbox model did not answer (${sb.error ?? "no reason given"}).` }
    : sb.acted ? { key: "sandbox", name: "Sandbox", value: `tried ${pretty(worst?.name ?? "a tool")}`, state: "flag", ms: ms("sandbox"),
        detail: `A separate model read the email with fake tools and tried ${tried}. Nothing ran; code counts it as an attack vote.` }
    : { key: "sandbox", name: "Sandbox", value: "no action", state: "clear", ms: ms("sandbox"),
        detail: "A separate model read the email with fake tools and did nothing beyond reading." };

  const rechecks = trace("recheck");
  const last = rechecks[rechecks.length - 1];
  const widened = rechecks.filter((t) => t.widened).length;
  const recheck: Station = !last
    ? { key: "recheck", name: "Re-check", value: "not needed", state: "skip", ms: 0, detail: "Nothing was cut, so there was nothing to check again." }
    : Number(last.left ?? 0) > 0
      ? { key: "recheck", name: "Re-check", value: "still flagged", state: "flag", ms: ms("recheck"),
          detail: `The cleaned email still raised a signal${widened ? " after the cut was widened" : ""}, so the whole email was blocked.` }
      : { key: "recheck", name: "Re-check", value: widened ? `clean, ${widened}× wider` : "clean", state: "clear", ms: ms("recheck"),
          detail: `The cleaned email went through the rules and classifiers again${widened ? `; the cut was widened ${widened}× first` : ""}. Nothing was left.` };

  return [rules, ...classifiers, language, judge, sandbox, recheck];
}

// The caption a clean email opens with, so a row nobody points at still says what happened
export const CLEAN_SUMMARY = "Rules, both classifiers and the language gate found nothing, so the LLM judge and sandbox were not needed.";
