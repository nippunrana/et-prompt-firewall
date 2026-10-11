"""A hard wall-clock limit around a call that may hang.

urllib's timeout applies to each socket read, so a server that trickles bytes can hold a call for many
minutes: two judge or sandbox calls hung for over 20 minutes in testing (2026-10-10), and the firewall runs
one check at a time, so every other check waited behind them. The call runs in a daemon thread; at the
deadline the caller gets TimeoutError and moves on, and the abandoned thread ends when its socket does.
"""

from __future__ import annotations

import threading
from typing import Any, Callable


def call_with_deadline(fn: Callable[..., Any], seconds: float, *args: Any, **kwargs: Any) -> Any:
    """fn(*args, **kwargs), or TimeoutError if it has not returned within `seconds`. Its own errors pass through."""
    box: dict[str, Any] = {}

    def run() -> None:
        try:
            box["value"] = fn(*args, **kwargs)
        except BaseException as e:  # handed to the caller, never lost in the thread
            box["error"] = e

    worker = threading.Thread(target=run, daemon=True)
    worker.start()
    worker.join(seconds)
    if worker.is_alive():
        raise TimeoutError(f"no answer within {seconds:.0f} s")
    if "error" in box:
        raise box["error"]
    return box["value"]
