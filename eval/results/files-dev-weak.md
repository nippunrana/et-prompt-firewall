# files-dev-weak

Split `dev`, commit `e16a16d`, LLM layers on, concealment rule (`FIREWALL_HIDDEN_STRONG`) off. 100 files, 0 errors.

| Set | Files | Flagged | Cut located in hidden text | Hidden payload gone from what the agent gets |
| :--- | ---: | ---: | ---: | ---: |
| HTML: LLMail attacks hidden in our carrier pages | 10 | 7/10 (70%) | 7/10 (70%) | 6/10 (60%) |
| HTML: the same pages with ordinary hidden content | 10 | 0/10 (0%) | – | – |
| Word: LLMail attacks hidden in our carrier files | 10 | 6/10 (60%) | 6/10 (60%) | 6/10 (60%) |
| Word: the same files with ordinary hidden content | 10 | 0/10 (0%) | – | – |
| PDF (CrackedPDFs): injected | 20 | 20/20 (100%) | 19/20 (95%) | – |
| PDF (CrackedPDFs): benign look-alike (same hiding, benign text) | 20 | 5/20 (25%) | – | – |
| PDF (CrackedPDFs): benign original | 20 | 0/20 (0%) | – | – |

**Per hiding technique** (attacks flagged · benign twins flagged):

| Format | Technique | Attacks flagged | Benign flagged |
| :--- | :--- | ---: | ---: |
| docx | comment | 1/2 (50%) | 0/2 (0%) |
| docx | tiny | 2/2 (100%) | 0/2 (0%) |
| docx | vanish | 2/3 (67%) | 0/3 (0%) |
| docx | white | 1/3 (33%) | 0/3 (0%) |
| html | alt | 1/2 (50%) | 0/2 (0%) |
| html | aria_hidden | 1/2 (50%) | 0/2 (0%) |
| html | comment | 2/2 (100%) | 0/2 (0%) |
| html | display_none | 1/2 (50%) | 0/2 (0%) |
| html | offscreen | 1/1 (100%) | 0/1 (0%) |
| html | white_text | 1/1 (100%) | 0/1 (0%) |
| pdf | invisible_render_mode | 8/8 (100%) | 0/16 (0%) |
| pdf | normal_visible | 2/2 (100%) | 1/4 (25%) |
| pdf | tiny_font | 6/6 (100%) | 4/12 (33%) |
| pdf | white_text | 4/4 (100%) | 0/8 (0%) |

**CrackedPDFs injected, per attack family:**

| Family | Flagged |
| :--- | ---: |
| existing_stream_patch | 2/2 (100%) |
| header_footer_like | 2/2 (100%) |
| in_page_invisible_text | 2/2 (100%) |
| in_page_low_contrast_text | 2/2 (100%) |
| in_page_split_text_objects | 2/2 (100%) |
| in_page_tiny_text | 1/1 (100%) |
| in_page_white_text | 1/1 (100%) |
| layout_mimicry | 1/1 (100%) |
| margin_microtext | 1/1 (100%) |
| microglyph_steganography | 1/1 (100%) |
| near_margin_normal_font | 1/1 (100%) |
| plain_single_block | 1/1 (100%) |
| semantic_fragmentation | 1/1 (100%) |
| split_text_objects | 1/1 (100%) |
| steganographic_acrostic | 1/1 (100%) |

Median 19.4 s per file; 76 judge calls, 80 sandbox runs.
