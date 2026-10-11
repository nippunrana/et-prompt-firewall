import React from "react";
import type { Usage } from "@/lib/demo-types";
import { checkpointStory, type StoryInput } from "@/lib/checkpoint";
import CallTag from "./CallTag";
import { Mark } from "./Pipeline";
import r from "./run.module.css";

// Checkpoint 1 for one checked item, line by line: what applied to this input, each layer, then the outcome.
// The same for every input type (lib/checkpoint.ts); `usage` holds the check's judge and sandbox calls.
// Folded on content that was already clean, open on content it cut or blocked, so the eye goes to what mattered.
export default function CheckStory({ usage, open, ...input }: StoryInput & { usage: Usage[]; open?: boolean }) {
  const ms = (step: string) => input.layers.trace.filter((t) => t.step === step).reduce((sum, t) => sum + t.ms, 0);
  return (
    <details className={r.storyBox} open={open ?? input.verdict !== "allow"}>
      <summary>What checkpoint 1 did with this {input.noun}</summary>
      <ol className={r.story} aria-label="What checkpoint 1 did">
        {checkpointStory(input).map((line) => {
          const call = line.role && usage.find((u) => u.role === line.role);
          return (
            <li key={line.key} className={line.key === "outcome" ? r.storyOutcome : undefined}>
              <Mark state={line.state} />
              <div className={r.storyText}>
                <span><strong>{line.name}.</strong> {line.text}</span>
                {call && <CallTag usage={call} took={ms(line.role!)} />}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}
