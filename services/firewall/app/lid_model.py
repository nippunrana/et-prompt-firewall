"""The language gate's model (GlotLID v3, Apache-2.0), pinned to an exact revision.

The published file is 1.7 GB. The Dockerfile runs this in its own build stage to download it and
quantise it to about 225 MB, and only the small file is copied into the image. It is kept apart
from `model_ids.py` so a change here never re-downloads the classifier weights layer.
"""

import sys

REPO = "cis-lmu/glotlid"
REVISION = "85cd6716494360367b75f642b5bc78667605d0b4"
FILE = "model_v3.bin"
PATH = "/opt/models/glotlid/glotlid_q.ftz"


def build(out: str) -> None:
    import fasttext
    from huggingface_hub import hf_hub_download

    model = fasttext.load_model(hf_hub_download(REPO, FILE, revision=REVISION))
    # The settings the gate was measured with (2026-10-04): no retraining, so no training data needed.
    model.quantize(retrain=False, qnorm=True, dsub=2)
    model.save_model(out)


if __name__ == "__main__":
    build(sys.argv[1])
