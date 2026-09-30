"""The real models, end to end. Slow and needs the weights, so it runs only when asked:
RUN_MODEL_TESTS=1 python -m pytest tests/test_models.py (inside the firewall image)."""

import os

import pytest

from app.check import run_check
from tests.fakes import BENIGN_EMAIL, DIRECT_ATTACK_EMAIL, DIRECT_ATTACK_LINE

pytestmark = pytest.mark.skipif(os.environ.get("RUN_MODEL_TESTS") != "1", reason="set RUN_MODEL_TESTS=1")


@pytest.fixture(scope="module")
def models():
    from app.classifiers import load

    return load()


def test_direct_attack_email(models):
    result = run_check(DIRECT_ATTACK_EMAIL, "email", models)
    assert result["verdict"] == "sanitise"
    [attack] = result["attacks"]
    assert attack["text"] == DIRECT_ATTACK_LINE
    assert {"instruction_override", "indirect_injection"} <= set(attack["types"])


def test_benign_email(models):
    result = run_check(BENIGN_EMAIL, "email", models)
    assert result["verdict"] == "allow"
    assert result["attacks"] == []
