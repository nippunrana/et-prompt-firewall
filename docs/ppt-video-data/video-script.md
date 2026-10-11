# Demo video script (target 3:40, limit 2–4 min)

Record on the Mac at `http://localhost:3020/projects/et-prompt-firewall`, never the live server: a protected run there takes minutes. Cut the waiting while an agent runs; never speed footage up. Record each scene separately and join them; a scene that goes wrong is retaken on its own.

**Grid claim:** F3 × D2, as declared in `docs/architecture.md` §12.

Corner badge for the edit (optional): "Attack types shown: n / 9", ticking up at each ✓ below.

---

### Scene 1 · 0:00–0:20 · The problem (slide or the hero page)

> "AI agents now read our email, documents and web pages, and they can send, forward and pay. One hidden sentence in an email can make an agent send your data to an attacker. This is ET Prompt Firewall: it checks everything an agent reads, and everything it tries to do. We claim **F3 × D2**: all nine attack types, with reliability measured on held-out data. It also reads PDFs, Word files, web pages and images, which we show but claim only as far as we measured."

### Scene 2 · 0:20–0:45 · How it works (the flowchart, `docs/ppt-video-data/pipeline-flowchart.html`)

> "Two checkpoints. First, every piece of content passes rules, two local classifiers and a language check. Anything they flag goes to an LLM judge, which names the attack and quotes it, and to a sandbox: a deliberately gullible model with fake tools. If the content makes it try to act, that is an attack. Code, never a model, makes the final decision. Second, every action the agent tries is checked by plain code that never reads the content."

### Scene 3 · 0:45–1:35 · The main demo: role change (Try it → Email inbox → **Role change**)

The unprotected agent fell for this one in 3 of 3 measured runs, so it is the safest live attack.

1. Show the inbox; point at the attacker's email. ✓ role change, ✓ indirect injection
   > "This email fakes the end of the message, then poses as you, asking the assistant to send data to an outside address."
2. Click **Run the AI orchestration**. The drawer opens; cut the wait.
3. Left lane: the unprotected agent sends the email (red, struck through). ✓ tool abuse
   > "Without the firewall, the agent does what the attacker wrote."
4. Right lane: open checkpoint 1; point at the judge and sandbox side by side, the cut, and the re-check.
   > "With the firewall, the attack line is cut before the agent reads it. The rest of the email still gets through, and the agent summarises it normally."

### Scene 4 · 1:35–2:15 · More attack types, one check each (same inbox)

Use **Add an email** → the example chip, then **Check this email** on it. Show only the verdict and the attack name; ~8 s each.

| Chip | Say | Badge |
| :-- | :-- | :-- |
| Instruction override | "The classic 'ignore all previous instructions'." | ✓ |
| Secret extraction | "Asks the agent to reveal its instructions or keys." | ✓ |
| Credential theft | "Asks for your one-time code. The action guard also blocks codes and passwords leaving." | ✓ |
| Multi-step jailbreak | "A split payload, joined step by step." | ✓ |
| Encoded (Base64) | "The order is hidden in Base64; the firewall decodes it first." | ✓ |
| Context poisoning | "A fake policy the user supposedly approved. If the content check lets one through, the action guard still blocks any send to an address the user never gave." | ✓ |

### Scene 5 · 2:15–2:55 · Files and images (the depth claim)

Click the bar at the top to switch input type. For each: **Check the example …** (or upload, then **Only check this …**).

1. **PDF** (`cv-white-text.pdf`): > "White text a person never sees. It is kept, marked as hidden, and cut."
2. **Word** (`invoice-hidden-text.docx`): > "Hidden-flagged text in a Word file, found the same way."
3. **Web page / HTML**: **Load an example**, **Only check this**. > "A hidden div in the HTML."
4. **Image**: upload `screenshot-injection.png`, click **Run both agents**. Show the drawer's "Extracting the text… with RapidOCR", then cut to the result. > "A screenshot: the text is read by OCR, then checked like everything else. We measured images too, and they are less reliable than text, so we do not claim them as D3."

### Scene 6 · 2:55–3:15 · A real request still works (Email → pick nothing; or show the results page row)

> "A firewall that blocks everything is useless. On held-out data: 94% of public attacks caught, and 1 real work email in 100 wrongly flagged. Legitimate send, forward and pay requests: 8 of 8 completed."

Show the **Results** page while saying it.

### Scene 7 · 3:15–3:30 · Oversight and limits (Audit log)

> "No step waits for a person; the audit log records every check and action and replays any run. And no defence is unbreakable: our limits and adaptive-attack tests are published in the repo."

### Scene 8 · 3:30–3:40 · Close

> "ET Prompt Firewall: open source, runs with one Docker command. Thank you."

---

**Before recording:** `docker compose ps` shows all three services healthy; the header's "All services up" is green; close other apps (the checks use the CPU). Do one full rehearsal of scene 3: if the unprotected agent does not fall for it, run it again (it is not guaranteed every time).
