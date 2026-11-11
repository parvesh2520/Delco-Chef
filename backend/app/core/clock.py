"""Server clock. Worked time and windows always use this, never a time sent by the phone. Tests may set `frozen`."""
from datetime import datetime, timezone

frozen: datetime | None = None


def now() -> datetime:
    return frozen or datetime.now(timezone.utc)
