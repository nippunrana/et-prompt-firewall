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

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download model weights during build so the image is self-contained and offline-ready.
# Keep this above `COPY app`: a code change would otherwise rebuild this layer and the VPS would pull it again.
RUN python -c "from rapidocr_onnxruntime import RapidOCR; from rapid_table import RapidTable; RapidOCR(); RapidTable()"

COPY app ./app

RUN useradd --system --uid 1001 app
USER app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
