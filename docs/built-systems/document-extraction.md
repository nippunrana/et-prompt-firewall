# Document extraction

`POST /extract-text` on the `firewall` service turns an uploaded image, PDF, Word, Excel or CSV file into text (`services/firewall/app/ocr.py`). It only extracts; no detector reads its output yet.

## Rules

- **Keep the concurrency cap (`OCR_SEMAPHORE`) and keep extraction off the event loop (`asyncio.to_thread`).** The server is shared with other live apps, and OCR is CPU-heavy. A blocked event loop also stalls `/health`, which the deploy reads to decide whether to roll back.
