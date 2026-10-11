// When the firewall runs its LLM judge and sandbox: only on text the detectors flag (the default), or on
// everything it checks. "Always" costs more model calls and seconds per item, and catches what the detectors miss.
export type LlmMode = "flagged" | "always";

const KEY = "et-prompt-firewall:llm";
export const LLM_EVENT = "et-llm-mode-changed";

export function getLlmMode(): LlmMode {
  try {
    return localStorage.getItem(KEY) === "always" ? "always" : "flagged";
  } catch {
    return "flagged";
  }
}

export function setLlmMode(mode: LlmMode) {
  localStorage.setItem(KEY, mode);
  window.dispatchEvent(new Event(LLM_EVENT));
}
