# files-held

Split `held`, commit `491654f`, LLM layers on, concealment rule (`FIREWALL_HIDDEN_STRONG`) off. 270 files, 0 errors.

| Set | Files | Flagged | Cut located in hidden text | Hidden payload gone from what the agent gets |
| :--- | ---: | ---: | ---: | ---: |
| HTML: LLMail attacks hidden in our carrier pages | 30 | 26/30 (87%) | 26/30 (87%) | 26/30 (87%) |
| HTML: the same pages with ordinary hidden content | 30 | 0/30 (0%) | – | – |
| Word: LLMail attacks hidden in our carrier files | 30 | 25/30 (83%) | 25/30 (83%) | 25/30 (83%) |
| Word: the same files with ordinary hidden content | 30 | 0/30 (0%) | – | – |
| PDF (CrackedPDFs): injected | 50 | 50/50 (100%) | 46/50 (92%) | – |
| PDF (CrackedPDFs): benign look-alike (same hiding, benign text) | 50 | 11/50 (22%) | – | – |
| PDF (CrackedPDFs): benign original | 50 | 0/50 (0%) | – | – |

**Per hiding technique** (attacks flagged · benign twins flagged):

| Format | Technique | Attacks flagged | Benign flagged |
| :--- | :--- | ---: | ---: |
| docx | comment | 5/7 (71%) | 0/7 (0%) |
| docx | tiny | 5/7 (71%) | 0/7 (0%) |
| docx | vanish | 8/8 (100%) | 0/8 (0%) |
| docx | white | 7/8 (88%) | 0/8 (0%) |
| html | alt | 5/5 (100%) | 0/5 (0%) |
| html | aria_hidden | 5/5 (100%) | 0/5 (0%) |
| html | comment | 5/5 (100%) | 0/5 (0%) |
| html | display_none | 5/5 (100%) | 0/5 (0%) |
| html | offscreen | 2/5 (40%) | 0/5 (0%) |
| html | white_text | 4/5 (80%) | 0/5 (0%) |
| pdf | invisible_render_mode | 20/20 (100%) | 0/40 (0%) |
| pdf | normal_visible | 7/7 (100%) | 3/14 (21%) |
| pdf | tiny_font | 12/12 (100%) | 8/24 (33%) |
| pdf | white_text | 11/11 (100%) | 0/22 (0%) |

The PDF techniques and families are CrackedPDFs' own labels for how it hid the text, not what the firewall detected. Its generator writes the appended text below the page edge, so the extractor marked nearly all of it as off-page text. Invisible render mode is never marked hidden (OCR'd scans use it legitimately); that text is read as visible.

**CrackedPDFs injected, per attack family:**

| Family | Flagged |
| :--- | ---: |
| existing_stream_patch | 4/4 (100%) |
| header_footer_like | 4/4 (100%) |
| in_page_invisible_text | 4/4 (100%) |
| in_page_low_contrast_text | 4/4 (100%) |
| in_page_split_text_objects | 4/4 (100%) |
| in_page_tiny_text | 3/3 (100%) |
| in_page_white_text | 3/3 (100%) |
| layout_mimicry | 3/3 (100%) |
| margin_microtext | 3/3 (100%) |
| microglyph_steganography | 3/3 (100%) |
| near_margin_normal_font | 3/3 (100%) |
| plain_single_block | 3/3 (100%) |
| semantic_fragmentation | 3/3 (100%) |
| split_text_objects | 3/3 (100%) |
| steganographic_acrostic | 3/3 (100%) |

Median 23.8 s per file; 219 judge calls, 222 sandbox runs.
