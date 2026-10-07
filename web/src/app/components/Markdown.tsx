import React from "react";

// Just enough Markdown for the agent's replies: paragraphs, bullet and numbered lists (one level of nesting), **bold**, *italic*
// and `code`. It builds React elements and never injects HTML, because the reply can quote attacker text.

const LIST_ITEM = /^\s*([-*•]|\d+[.)])\s+/;

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^`[^`]+`$/.test(part)) return <code key={i}>{part.slice(1, -1)}</code>;
    if (/^\*[^*\s][^*]*\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    return part;
  });
}

const lines = (ls: string[]) => ls.map((l, i) => <React.Fragment key={i}>{i > 0 && <br />}{inline(l)}</React.Fragment>);

export default function Markdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  type ListItem = { lines: string[]; sub: string[] };
  const state: { para: string[]; list: { ordered: boolean; items: ListItem[] } | null } = { para: [], list: null };

  const flush = () => {
    if (state.para.length) blocks.push(<p key={blocks.length}>{lines(state.para)}</p>);
    if (state.list) {
      const items = state.list.items.map((it, i) => (
        <li key={i}>
          {lines(it.lines)}
          {it.sub.length > 0 && <ul>{it.sub.map((x, k) => <li key={k}>{inline(x)}</li>)}</ul>}
        </li>
      ));
      blocks.push(state.list.ordered ? <ol key={blocks.length}>{items}</ol> : <ul key={blocks.length}>{items}</ul>);
    }
    state.para = [];
    state.list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.replace(/^#{1,6}\s+(.*)$/, "**$1**");
    const marker = line.match(LIST_ITEM);
    const last = state.list?.items[state.list.items.length - 1];
    if (!line.trim()) {
      // A blank line ends a paragraph but not a list: replies often put blank lines between items
      if (!state.list) flush();
    } else if (marker && last && /^\s/.test(line)) {
      last.sub.push(line.slice(marker[0].length)); // an indented item nests under the one above
    } else if (marker) {
      const ordered = /\d/.test(marker[1]);
      if (!state.list || state.list.ordered !== ordered) {
        flush();
        state.list = { ordered, items: [] };
      }
      state.list.items.push({ lines: [line.slice(marker[0].length)], sub: [] });
    } else if (last && /^\s/.test(line)) {
      last.lines.push(line.trim()); // an indented line continues the item
    } else {
      if (state.list) flush();
      state.para.push(line.trim());
    }
  }
  flush();
  return <>{blocks}</>;
}
