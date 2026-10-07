# The language gate's model: download the 1.7 GB GlotLID file and quantise it here, in one step,
# so only the 225 MB result reaches the image (the download never lands in any layer we ship).
FROM python:3.12.14-slim AS lid
RUN pip install --no-cache-dir fasttext-wheel==0.9.2 "numpy<2.0.0" huggingface_hub==1.33.0
COPY app/lid_model.py /build/lid_model.py
RUN python /build/lid_model.py /build/glotlid_q.ftz && rm -rf /root/.cache/huggingface

FROM python:3.12.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    libxcb1 \
    && rm -rf /var/lib/apt/lists/*

# CPU-only PyTorch: the VPS has no GPU, and the default build pulls gigabytes of CUDA libraries.
# Its own layer, first, so a change to requirements.txt never downloads it again.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch==2.14.0

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download model weights during build so the image is self-contained and offline-ready.
# Keep this above `COPY app`: a code change would otherwise rebuild this layer and the VPS would pull it again.
RUN python -c "from rapidocr_onnxruntime import RapidOCR; from rapid_table import RapidTable; RapidOCR(); RapidTable()"

# The classifier weights (PIGuard, Prompt Guard 2) are baked in, like the OCR models, and also above
# `COPY app`. Prompt Guard 2 is gated: the Hugging Face token arrives as a build secret, so it is
# never stored in any image layer. Without it the build fails rather than ship an image with no models.
ENV HF_HOME=/opt/models
COPY app/model_ids.py ./app/model_ids.py
RUN --mount=type=secret,id=hf_token,required=true \
    HF_TOKEN="$(cat /run/secrets/hf_token)" python -m app.model_ids \
    && chmod -R a+rX /opt/models
COPY --from=lid /build/glotlid_q.ftz /opt/models/glotlid/glotlid_q.ftz
# At run time the models load from the image only; the container never downloads anything.
# One OpenMP thread: the container is capped at one CPU, and extra threads spinning against that
# quota made scoring 6x slower (measured: 386 ms vs 61 ms per window).
ENV HF_HUB_OFFLINE=1 \
    OMP_NUM_THREADS=1

COPY app ./app

# /data holds the tool-call guard's review log; Compose mounts a named volume there.
RUN useradd --system --uid 1001 app \
    && mkdir -p /data && chown app /data
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
