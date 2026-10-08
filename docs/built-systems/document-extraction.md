# Document extraction

`POST /extract-text` on the `firewall` service turns an uploaded image, PDF, Word, Excel or CSV file into text (`services/firewall/app/ocr.py`), with the ranges of hidden text in PDF and Word (`app/hidden_text.py`). `POST /check-file` extracts and then runs the check on the result; HTML files go straight to the check as HTML.

## Rules

- **Keep the concurrency cap (`OCR_SEMAPHORE`) and keep extraction off the event loop (`asyncio.to_thread`).** The server is shared with other live apps, and OCR is CPU-heavy. A blocked event loop also stalls `/health`, which the deploy reads to decide whether to roll back.
- **Never drop hidden text, and never pass it off as ordinary text.** The agent reading the file would still get it, so it stays in the extracted text, and its range is returned (`hidden`) so the check reads it as a hidden layer. Dropping it would hide the attack from the detectors; unmarked, the classifiers read it as prose next to the visible text.
- **Never truncate a file to fit the check.** `/check-file` rejects text over `MAX_CHECK_CHARS` with a 413 and a clear message: a truncated check hands the agent unchecked text.
- **Hidden means: PDF characters off the page, under 2 pt, or white with no dark box or image behind them; Word runs with `w:vanish`, near-white colour or under 2 pt, and comments.** Word headers, footers and text boxes are visible text (they were not read before 2026-10-08).
- **Never flag PDF invisible render mode.** OCR'd scans put their text layer in that mode legitimately, and pdfplumber does not expose it. Text under a shape, text matching a coloured background, Word footnotes, and hidden Excel rows and sheets are not detected: stated limits.
- **Never add PyMuPDF.** It is AGPL; pdfplumber's per-character size, colour and position cover the checks above.
