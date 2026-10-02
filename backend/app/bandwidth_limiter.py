"""
Bandwidth Rate Limiter for Traffis Backend.

Tracks outbound data transfer (bytes sent to clients) with an hourly accrual
budget model:
  - Each elapsed hour of the day adds RATE_LIMIT_MB_PER_HOUR to the budget.
  - Unused bytes carry forward until end of day (midnight local time).
  - At midnight, usage resets to 0.

All state is held in memory and lost on restart (by design).
"""

import logging
from datetime import datetime

logger = logging.getLogger("traffis_bandwidth")


class BandwidthLimiter:
    """In-memory bandwidth rate limiter with daily reset and hourly accrual."""

    def __init__(self, mb_per_hour: float = 100.0):
        self.mb_per_hour: float = mb_per_hour
        self.bytes_per_hour: int = int(mb_per_hour * 1024 * 1024)

        # Tracking state
        self._bytes_used: int = 0
        self._current_date: str = self._today_str()
        self._throttle_logged: bool = False  # Avoid log spam when throttled

        logger.info(
            "Bandwidth limiter initialized: %s MB/hour (%s bytes/hour), "
            "daily budget at hour 24 = %s MB",
            self.mb_per_hour,
            f"{self.bytes_per_hour:,}",
            f"{self.mb_per_hour * 24:,.0f}",
        )

    # ── Public API ──────────────────────────────────────────────────────

    def is_allowed(self, num_bytes: int = 0) -> bool:
        """Check whether sending `num_bytes` would exceed the current budget.

        If num_bytes is 0, checks whether any transfer is still possible.
        """
        self._maybe_reset_day()
        budget = self._current_budget()
        return (self._bytes_used + num_bytes) <= budget

    def record(self, num_bytes: int) -> None:
        """Record that `num_bytes` were sent to clients."""
        self._maybe_reset_day()
        self._bytes_used += num_bytes

    def try_record(self, num_bytes: int) -> bool:
        """Attempt to record bytes. Returns True if allowed, False if over budget."""
        self._maybe_reset_day()
        budget = self._current_budget()
        if (self._bytes_used + num_bytes) > budget:
            if not self._throttle_logged:
                logger.warning(
                    "Bandwidth limit reached! Used: %s / Budget: %s (hour %d of day)",
                    self._fmt_bytes(self._bytes_used),
                    self._fmt_bytes(budget),
                    self._current_hour(),
                )
                self._throttle_logged = True
            return False
        self._bytes_used += num_bytes
        self._throttle_logged = False
        return True

    def get_usage(self) -> dict:
        """Return current usage statistics for monitoring/API exposure."""
        self._maybe_reset_day()
        budget = self._current_budget()
        return {
            "bytes_used": self._bytes_used,
            "bytes_budget": budget,
            "mb_used": round(self._bytes_used / (1024 * 1024), 2),
            "mb_budget": round(budget / (1024 * 1024), 2),
            "percent_used": round(
                (self._bytes_used / budget * 100) if budget > 0 else 0, 1
            ),
            "mb_per_hour_limit": self.mb_per_hour,
            "hours_elapsed": self._current_hour() + 1,
            "is_throttled": self._bytes_used >= budget,
            "date": self._current_date,
        }

    # ── Internal helpers ────────────────────────────────────────────────

    def _current_budget(self) -> int:
        """Calculate available budget based on elapsed hours today.

        Budget = (elapsed_hours + 1) * bytes_per_hour

        The +1 ensures there is always at least 1 hour of budget available
        at the start of each hour (hour 0 = midnight gets 1 * bytes_per_hour).
        """
        hours_elapsed = self._current_hour()
        return (hours_elapsed + 1) * self.bytes_per_hour

    def _current_hour(self) -> int:
        """Return the current hour of the day (0-23)."""
        return datetime.now().hour

    def _maybe_reset_day(self) -> None:
        """Reset usage counters if we've crossed into a new calendar day."""
        today = self._today_str()
        if today != self._current_date:
            logger.info(
                "New day detected (%s -> %s). Resetting bandwidth usage. "
                "Yesterday's total: %s",
                self._current_date,
                today,
                self._fmt_bytes(self._bytes_used),
            )
            self._bytes_used = 0
            self._current_date = today
            self._throttle_logged = False

    @staticmethod
    def _today_str() -> str:
        return datetime.now().strftime("%Y-%m-%d")

    @staticmethod
    def _fmt_bytes(b: int) -> str:
        if b < 1024:
            return f"{b} B"
        elif b < 1024 * 1024:
            return f"{b / 1024:.1f} KB"
        elif b < 1024 * 1024 * 1024:
            return f"{b / (1024 * 1024):.1f} MB"
        else:
            return f"{b / (1024 * 1024 * 1024):.2f} GB"
