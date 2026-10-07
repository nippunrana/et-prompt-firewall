# Audit log (`GET /audit`)

The system's oversight: no step waits for a person, so this log is how a person checks afterwards what the firewall decided. Code: `services/firewall/app/audit.py`; shown in the UI's Audit log tab.

## Rules

- **Never store the checked text.** Entries hold the verdict, lane, attack types, cuts and the layers that cut, plus a hash and the length of the content. The demo is public; visitors paste what they like.
- **One line per `/check` and per outgoing action the guard decided on.** Reads (`read_inbox` and the like) are always allowed and are not logged; logging them buried the actions.
- **Writing the log never fails a request.** A full disk or missing volume is logged as an error; the check still answers.
- **A JSONL file on the `guard-review` volume, not a database** (user decision, 2026-10-07). Postgres was removed from the project: it was only ever pinged by a health check, and requiring it stopped judges from running the stack from the README. The guard's review log (`guard.py`) stays a separate file: it holds full action arguments for rule-setting, which the audit log does not.
