"""Cutting: turn the evidence into cuts in the original text, and build the cleaned text.

Every position here is in the original text. Code does all the cutting; a model only points at text.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.prepare import Unit
from app.sandbox import ADDRESS

OUTSIDE_TYPE = "indirect_injection"


@dataclass
class Cut:
    start: int
    end: int
    types: list[str] = field(default_factory=list)
    found_by: list[str] = field(default_factory=list)
    rules: list[str] = field(default_factory=list)
    strong_rule: bool = False


def label(types: list[str]) -> str:
    shown = [t.replace("_", " ") for t in types if t != OUTSIDE_TYPE]
    return ", ".join(shown) if shown else "suspected injection"


def sentence(content: str, units: list[Unit], start: int, end: int, neighbours: bool = False) -> tuple[int, int]:
    """Widens [start, end) to the sentences it touches (and the ones either side, if asked).
    A multi-line unit (an email's header block) is narrowed to the lines touched instead."""
    hit = [u for u in units if u.start < end and start < u.end]
    if neighbours and hit:
        first, last = hit[0].index, hit[-1].index
        hit = [u for u in units if first - 1 <= u.index <= last + 1]
    if not hit:
        return start, end
    lo, hi = hit[0].start, hit[-1].end
    if "\n" in content[lo:hi] and len(hit) == 1:  # header block: cut only the touched lines
        lo = content.rfind("\n", 0, start) + 1
        nl = content.find("\n", end)
        hi = len(content) if nl < 0 else nl
    return min(lo, start), max(hi, end)


def sweep(content: str, units: list[Unit], cuts: list[Cut]) -> list[Cut]:
    """The payload sweep: an address or link inside cut text that also appears elsewhere in the
    content is the attack's payload; cut the sentences that still carry it."""
    added = []
    for cut in cuts:
        for address in set(ADDRESS.findall(content[cut.start:cut.end])):
            lower, needle = content.lower(), address.lower()
            pos = lower.find(needle)
            while pos >= 0:
                if not any(c.start <= pos < c.end for c in cuts + added):
                    s, e = sentence(content, units, pos, pos + len(address))
                    added.append(Cut(s, e, list(cut.types), ["payload sweep"]))
                pos = lower.find(needle, pos + 1)
    return cuts + added


def merge(cuts: list[Cut]) -> list[Cut]:
    merged: list[Cut] = []
    for cut in sorted(cuts, key=lambda c: c.start):
        if merged and cut.start < merged[-1].end:
            last = merged[-1]
            last.end = max(last.end, cut.end)
            last.types = list(dict.fromkeys(last.types + cut.types))
            last.found_by = list(dict.fromkeys(last.found_by + cut.found_by))
            last.rules = sorted(set(last.rules + cut.rules))
            last.strong_rule = last.strong_rule or cut.strong_rule
        else:
            merged.append(Cut(cut.start, cut.end, list(cut.types), list(cut.found_by), list(cut.rules), cut.strong_rule))
    return merged


@dataclass
class Cleaned:
    text: str  # what the AI receives: cuts replaced by visible markers
    detect: str  # the kept text alone, for re-checking (markers would mislead the detectors)
    segments: list[tuple[int, int, int]]  # (position in detect, position in the original, length)

    def to_original(self, start: int, end: int) -> tuple[int, int]:
        def one(p: int) -> int:
            for d, o, n in self.segments:
                if d <= p < d + n:
                    return o + p - d
            return self.segments[-1][1] + self.segments[-1][2] if self.segments else 0
        return one(start), one(max(start, end - 1)) + 1


def apply(content: str, cuts: list[Cut]) -> Cleaned:
    parts, detect, segments, pos = [], [], [], 0
    for cut in cuts:
        kept = content[pos:cut.start]
        parts += [kept, f"[removed by firewall: {label(cut.types)}]"]
        if kept.strip():
            segments.append((sum(len(d) + 1 for d in detect), pos, len(kept)))
            detect.append(kept)
        pos = cut.end
    tail = content[pos:]
    if tail.strip():
        segments.append((sum(len(d) + 1 for d in detect), pos, len(tail)))
        detect.append(tail)
    return Cleaned("".join(parts) + tail, "\n".join(detect), segments)
