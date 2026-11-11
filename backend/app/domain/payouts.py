"""Part G weekly chef earnings (Monday 00:00 – Sunday 23:59:59 IST)."""
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from app.domain import IST


def cycle_start(at: datetime) -> date:
    d = at.astimezone(IST).date()
    return d - timedelta(days=d.weekday())


@dataclass
class PayableVisit:
    visit_id: int
    amount_paise: int
    scheduled_minutes: int
    worked_minutes: int | None
    kind: str  # trial | subscription
    cancelled: bool
    needs_review: bool


def chef_share(v: PayableVisit, share_percent: int = 80, short_threshold_percent: int = 90) -> int | None:
    """None = held back (needs review). 0 = not payable."""
    if v.needs_review:
        return None
    if v.cancelled or v.kind == "trial" or v.worked_minutes is None:
        return 0
    share = v.amount_paise * share_percent // 100
    if v.worked_minutes * 100 < v.scheduled_minutes * short_threshold_percent:
        share = share * v.worked_minutes // v.scheduled_minutes
    return share
