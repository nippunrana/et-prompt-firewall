// Checkpoint 1, the content check, told in plain words. One framework for every input type: what the front end
// found for this input (OCR, HTML split, a file's hidden text, encoded text), each detector layer in the order the
// firewall runs it (lib/layers.ts), then the outcome. Only what applied to this input is listed; every line comes
// from the recorded check, never a guess.
import { pretty, type Layers } from "./demo-types";
import { stations, type StationState } from "./layers";
import type { RowState } from "./pipeline";

export const CHECKPOINT_1 = "Checkpoint 1 checks everything the agent is about to read, before it reads it.";

// Each kind of hidden or encoded part, singular and plural (services/firewall/app/formats.py, hidden_text.py, prepare.py)
const KIND: Record<string, [string, string]> = {
  html_comment: ["HTML comment", "HTML comments"], html_hidden: ["hidden page element", "hidden page elements"],
  html_attribute: ["piece of image or meta text", "pieces of image or meta text"],
  pdf_white_text: ["white-text passage", "white-text passages"], pdf_tiny_text: ["tiny-text passage", "tiny-text passages"],
  pdf_off_page_text: ["passage placed off the page", "passages placed off the page"],
  docx_hidden_text: ["passage marked hidden", "passages marked hidden"], docx_white_text: ["white-text passage", "white-text passages"],
  docx_tiny_text: ["tiny-text passage", "tiny-text passages"], docx_comment: ["reviewer comment", "reviewer comments"],
  base64: ["base64 block", "base64 blocks"], hex: ["hex-encoded block", "hex-encoded blocks"],
  unicode_tags: ["invisible Unicode-tag passage", "invisible Unicode-tag passages"],
  variation_selectors: ["passage hidden in variation selectors", "passages hidden in variation selectors"],
};
export const kindName = (kind: string, n = 1) => KIND[kind]?.[n === 1 ? 0 : 1] ?? pretty(kind);

const ENCODED = new Set(["base64", "hex", "unicode_tags", "variation_selectors"]);
const STATE: Record<StationState, RowState> = { flag: "flag", hint: "flag", clear: "done", skip: "skip", off: "off" };

export interface StoryLine {
  key: string;
  state: RowState;
  name: string;
  text: string;
  role?: "judge" | "sandbox"; // an AI model call: the caller shows its model, time and cost
}

export interface StoryInput {
  layers: Layers;
  lane: string | undefined;
  verdict: string | undefined;
  cuts: number;
  noun: string; // what was checked: "email", "web page", "PDF", "message" …
  ocr?: boolean; // the text was read from an image first
  ownMessage?: boolean; // the user's own message: the firewall never gives it to the sandbox
  hypothetical?: boolean; // a check on its own, with no agent: "would get", not "got"
}

const count = (kinds: Record<string, number>, keep: (k: string) => boolean) =>
  Object.entries(kinds).filter(([k]) => keep(k)).map(([k, n]) => `${n} ${kindName(k, n)}`).join(", ");

export function checkpointStory(c: StoryInput): StoryLine[] {
  const prep = c.layers.trace.find((t) => t.step === "prepare");
  const kinds = (prep?.kinds ?? {}) as Record<string, number>;
  const lines: StoryLine[] = [];

  // The front end: only what this input type went through
  if (c.ocr) lines.push({ key: "ocr", state: "done", name: "Text recognition", text: "Read the text in the image with OCR, so it can be checked like typed text." });
  if (prep?.fmt === "html") {
    const hidden = count(kinds, (k) => k.startsWith("html_"));
    lines.push({ key: "html", state: "done", name: "Page split",
      text: `Split the page into what a reader sees and what is hidden: ${hidden || "nothing hidden"}. Both are checked.` });
  }
  if (typeof prep?.marked === "number" && !c.ocr) { // an image has no hidden text to mark: its words come from OCR
    const hidden = count(kinds, (k) => k.startsWith("pdf_") || k.startsWith("docx_"));
    lines.push({ key: "file", state: "done", name: "Hidden text",
      text: `Marked the text a reader would not see in the file: ${hidden || "none found"}. It is checked like the rest.` });
  }
  const encoded = count(kinds, (k) => ENCODED.has(k));
  if (encoded) lines.push({ key: "decoded", state: "done", name: "Decoding", text: `Decoded ${encoded}, so the words inside are checked too.` });
  if (prep) {
    const units = Number(prep.units ?? 0);
    lines.push({ key: "prepare", state: "done", name: "Preparation",
      text: `Split ${c.ocr ? "the text read from the image" : `the ${c.noun}`} into ${units} sentence${units === 1 ? "" : "s"} and unpacked any invisible characters.` });
  }

  // The detector layers, the same for every input
  // An image's detectors read the text OCR found in it, so their lines speak of that text
  for (const s of stations(c.layers, c.lane, c.ocr ? "text" : c.noun, c.ownMessage)) {
    lines.push({ key: s.key, state: STATE[s.state], name: s.name, text: s.detail,
      role: (s.key === "judge" || s.key === "sandbox") && c.layers[s.key] ? s.key : undefined });
  }

  // The outcome
  const got = c.hypothetical ? "would get" : "got";
  const parts = `${c.cuts} part${c.cuts === 1 ? "" : "s"}`;
  lines.push(c.verdict === "quarantine"
    ? { key: "outcome", state: "flag", name: "Blocked", text: `The ${c.noun} could not be cleaned safely, so the agent ${got} a note saying it was withheld.` }
    : c.verdict === "sanitise"
      ? { key: "outcome", state: "flag", name: "Cleaned", text: `Cut ${parts}, shown struck through; the agent ${got} the rest.` }
      : { key: "outcome", state: "done", name: "Already clean",
          text: `${c.lane === "clean" ? "Nothing was flagged" : "Nothing needed cutting"}, so the agent ${got} the ${c.noun} unchanged.` });
  return lines;
}
