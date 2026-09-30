from app.locate import locate, windows
from app.prepare import prepare
from tests.fakes import KeywordClassifier

LETTER = "One. Two. Three. Four. Evil line here. Six. Seven. Eight."


def test_windows():
    assert windows(0) == []
    assert windows(2) == [(0, 2)]
    assert windows(5) == [(0, 3), (1, 4), (2, 5)]


def test_drills_down_to_the_bad_sentence():
    p = prepare(LETTER)
    located = locate(p.units, p.view.text, [KeywordClassifier("A", ["evil line"])], 0.5)
    assert [g.units for g in located.groups] == [(4,)]
    assert located.groups[0].flagged_by == ["A"]


def test_pair_bad_only_together_is_cut_together():
    class Together(KeywordClassifier):
        def _one(self, text):
            return 0.99 if "Three." in text and "Four." in text else 0.01

    p = prepare(LETTER)
    located = locate(p.units, p.view.text, [Together("A", [])], 0.5)
    assert [g.units for g in located.groups] == [(2, 3)]


def test_every_window_scored_even_when_the_whole_text_scores_low():
    p = prepare(LETTER)
    located = locate(p.units, p.view.text, [KeywordClassifier("A", ["evil line"], whole=0.02)], 0.5)
    assert [g.units for g in located.groups] == [(4,)]


def test_two_separate_attacks_are_both_found():
    p = prepare("Evil one. Alpha. Beta. Gamma. Delta. Echo. Evil two.")
    located = locate(p.units, p.view.text, [KeywordClassifier("A", ["evil"])], 0.5)
    assert sorted(g.units for g in located.groups) == [(0,), (6,)]


def test_a_short_fragment_alone_never_starts_a_cut():
    # Only the single unit scores high; every window containing it reads it with context and scores low.
    class FragmentOnly(KeywordClassifier):
        def _one(self, text):
            return 0.99 if text == "Subject line" else 0.01

    p = prepare("Subject line\nHello there. How are you. Fine thanks.")
    located = locate(p.units, p.view.text, [FragmentOnly("A", [])], 0.5)
    assert located.groups == []


def test_high_whole_text_with_no_high_window_is_unlocated():
    p = prepare(LETTER)
    located = locate(p.units, p.view.text, [KeywordClassifier("A", [], whole=0.95)], 0.5)
    assert located.groups == [] and located.unlocated
