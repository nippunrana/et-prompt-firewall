"""The classifier models, pinned to exact revisions.

The Dockerfile copies this file on its own and runs it to bake the weights into the image,
above `COPY app`, so a code change never downloads them again. Changing a revision here
re-downloads that layer.
"""

import os

MODELS = {
    "WolfDefender": {
        "repo": "patronus-studio/wolf-defender-prompt-injection-small",
        "revision": "bcab2eff97bcabd7227849639e2d0d7a61b46c92",
        # The Transformers checkpoint only: the repo also ships ONNX variants and a cascade we do not use.
        # The image redistributes these weights, so the licence travels with them.
        "files": ["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json",
                  "special_tokens_map.json", "LICENSE", "README.md"],
        "max_tokens": 2048, "stride": 64,  # its model card: 2,048-token windows sharing 64 tokens
    },
    "PromptGuard2": {
        "repo": "meta-llama/Llama-Prompt-Guard-2-86M",
        "revision": "a8ded8e697ce7c355e395a0df51f94adb4a2fd27",
        # The image redistributes these weights, so the licence and use policy travel with them.
        "files": ["config.json", "model.safetensors", "tokenizer.json", "tokenizer_config.json",
                  "special_tokens_map.json", "LICENSE", "USE_POLICY.md", "README.md"],
        "max_tokens": 512, "stride": 128,
    },
}


def download() -> None:
    from huggingface_hub import snapshot_download

    token = os.environ.get("HF_TOKEN") or None  # Prompt Guard 2 is gated
    for spec in MODELS.values():
        snapshot_download(spec["repo"], revision=spec["revision"], allow_patterns=spec["files"], token=token)


if __name__ == "__main__":
    download()
