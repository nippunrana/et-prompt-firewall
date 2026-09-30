"""Step 5a, locate: which units hold the attack, from the classifiers' scores.

Every window of three units is scored; a window is never skipped because the whole text scored
low (a bad line inside a long friendly email is diluted). Pair and single-unit scores are only
used to pin down the culprit inside a window that is already high: a short fragment on its own
gets unreliable scores (a subject line or a shell command can score 1.0), so it never triggers
a cut by itself.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.classifiers import Classifier
from app.prepare import Unit

WINDOW = 3


@dataclass
class Group:
    """Units to cut together, and which classifiers flagged the window they were found in."""

    units: tuple[int, ...]
    flagged_by: list[str]
    scores: dict[str, float]  # each classifier's score on the text that was finally located


@dataclass
class Located:
    whole: dict[str, float]  # each classifier's score on the full text
    max_window: dict[str, float]
    groups: list[Group] = field(default_factory=list)
    unlocated: bool = False  # the full text scored high but no window did


def windows(n: int) -> list[tuple[int, int]]:
    """[start, end) unit ranges: every run of three units, or everything if there are fewer."""
    if n == 0:
        return []
    if n <= WINDOW:
        return [(0, n)]
    return [(i, i + WINDOW) for i in range(n - WINDOW + 1)]


class _Scores:
    """Scores unit ranges with every classifier, each range at most once."""

    def __init__(self, units: list[Unit], classifiers: list[Classifier]):
        self.units, self.classifiers = units, classifiers
        self.cache: dict[tuple[int, int], dict[str, float]] = {}

    def get(self, spans: list[tuple[int, int]]) -> list[dict[str, float]]:
        todo = [s for s in dict.fromkeys(spans) if s not in self.cache]
        if todo:
            texts = [" ".join(u.text for u in self.units[a:b]) for a, b in todo]
            by_clf = {c.name: c.score(texts) for c in self.classifiers}
            for i, span in enumerate(todo):
                self.cache[span] = {name: scores[i] for name, scores in by_clf.items()}
        return [self.cache[s] for s in spans]


def _top(scores: dict[str, float]) -> float:
    return max(scores.values())


def _drill(scores: _Scores, window: tuple[int, int], threshold: float) -> tuple[int, ...]:
    """Narrows a high window to the unit(s) to cut: the bad single units if any, else the
    worse pair, else the whole window (bad only when read together)."""
    a, b = window
    if b - a == 1:
        return (a,)
    target = window
    if b - a == 3:
        pairs = [(a, a + 2), (a + 1, a + 3)]
        pair_scores = scores.get(pairs)
        best = max((0, 1), key=lambda i: _top(pair_scores[i]))
        if _top(pair_scores[best]) >= threshold:
            target = pairs[best]
    singles = [(i, i + 1) for i in range(*target)]
    bad = [i for (i, _), s in zip(singles, scores.get(singles)) if _top(s) >= threshold]
    return tuple(bad) if bad else tuple(range(*target))


def locate(units: list[Unit], text: str, classifiers: list[Classifier], threshold: float) -> Located:
    whole = {c.name: c.score_long(text) for c in classifiers}
    wins = windows(len(units))
    scores = _Scores(units, classifiers)
    win_scores = scores.get(wins)
    max_window = {c.name: max((s[c.name] for s in win_scores), default=0.0) for c in classifiers}
    located = Located(whole, max_window)

    # Drill into every high window, worst first, skipping windows already explained by a culprit.
    high = sorted((w for w, s in zip(wins, win_scores) if _top(s) >= threshold),
                  key=lambda w: _top(scores.cache[w]), reverse=True)
    covered: set[int] = set()
    for w in high:
        if covered & set(range(*w)):
            continue
        found = _drill(scores, w, threshold)
        covered |= set(found)
        span = (min(found), max(found) + 1)
        final = scores.get([span])[0]
        flagged_by = [name for name, s in scores.cache[w].items() if s >= threshold]
        located.groups.append(Group(found, flagged_by, final))

    located.unlocated = not located.groups and _top(whole) >= threshold
    return located
