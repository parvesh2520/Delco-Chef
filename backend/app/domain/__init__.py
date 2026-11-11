"""Pure business rules. No database, no HTTP — every function here is unit-testable in isolation."""
from datetime import date, datetime, time, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30))  # India has no DST, a fixed offset is exact.


def ist_today(now: datetime | None = None) -> date:
    return (now or datetime.now(timezone.utc)).astimezone(IST).date()


def ist_datetime(d: date, t: time) -> datetime:
    """IST wall-clock → aware datetime (store as UTC)."""
    return datetime.combine(d, t, tzinfo=IST).astimezone(timezone.utc)


def parse_hhmm(s: str) -> time:
    h, m = s.strip().split(":")
    return time(int(h), int(m))
