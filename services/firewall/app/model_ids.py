"""The classifier models, pinned to exact revisions.

The Dockerfile copies this file on its own and runs it to bake the weights into the image,
above `COPY app`, so a code change never downloads them again. Changing a revision here
re-downloads that layer.
"""

import os

MODELS = {
    "PIGuard": {
        "repo": "leolee99/PIGuard",
        "revision": "dd78b24e330193a22d2293ac66922dd4f982f563",
        # spm.model in this repo is a Git LFS pointer, not a model: only tokenizer.json is real.
        "files": ["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json",
                  "special_tokens_map.json", "added_tokens.json", "README.md"],
    },
    "PromptGuard2": {
        "repo": "meta-llama/Llama-Prompt-Guard-2-86M",
        "revision": "a8ded8e697ce7c355e395a0df51f94adb4a2fd27",
        # The image redistributes these weights, so the licence and use policy travel with them.
        "files": ["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json",
                  "special_tokens_map.json", "LICENSE", "USE_POLICY.md", "README.md"],
    },
}


def download() -> None:
    from huggingface_hub import snapshot_download

    token = os.environ.get("HF_TOKEN") or None  # Prompt Guard 2 is gated
    for spec in MODELS.values():
        snapshot_download(spec["repo"], revision=spec["revision"], allow_patterns=spec["files"], token=token)


if __name__ == "__main__":
    download()
