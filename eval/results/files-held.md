# files-held

Split `held`, commit `7be73ca`, LLM layers on, concealment rule (`FIREWALL_HIDDEN_STRONG`) off. 270 files, 0 errors.

| Set | Files | Flagged | Cut located in hidden text | Hidden payload gone from what the agent gets |
| :--- | ---: | ---: | ---: | ---: |
| HTML: LLMail attacks hidden in our carrier pages | 30 | 30/30 (100%) | 30/30 (100%) | 30/30 (100%) |
| HTML: the same pages with ordinary hidden content | 30 | 0/30 (0%) | – | – |
| Word: LLMail attacks hidden in our carrier files | 30 | 29/30 (97%) | 29/30 (97%) | 29/30 (97%) |
| Word: the same files with ordinary hidden content | 30 | 0/30 (0%) | – | – |
| PDF (CrackedPDFs): injected | 50 | 49/50 (98%) | 45/50 (90%) | – |
| PDF (CrackedPDFs): benign look-alike (same hiding, benign text) | 50 | 11/50 (22%) | – | – |
| PDF (CrackedPDFs): benign original | 50 | 0/50 (0%) | – | – |

**Per hiding technique** (attacks flagged · benign twins flagged):

| Format | Technique | Attacks flagged | Benign flagged |
| :--- | :--- | ---: | ---: |
| docx | comment | 7/7 (100%) | 0/7 (0%) |
| docx | tiny | 6/7 (86%) | 0/7 (0%) |
| docx | vanish | 8/8 (100%) | 0/8 (0%) |
| docx | white | 8/8 (100%) | 0/8 (0%) |
| html | alt | 5/5 (100%) | 0/5 (0%) |
| html | aria_hidden | 5/5 (100%) | 0/5 (0%) |
| html | comment | 5/5 (100%) | 0/5 (0%) |
| html | display_none | 5/5 (100%) | 0/5 (0%) |
| html | offscreen | 5/5 (100%) | 0/5 (0%) |
| html | white_text | 5/5 (100%) | 0/5 (0%) |
| pdf | invisible_render_mode | 20/20 (100%) | 0/40 (0%) |
| pdf | normal_visible | 6/7 (86%) | 2/14 (14%) |
| pdf | tiny_font | 12/12 (100%) | 9/24 (38%) |
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
| steganographic_acrostic | 2/3 (67%) |

Median 17.6 s per file; 191 judge calls, 213 sandbox runs.
