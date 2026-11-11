"""Part B/C pricing. Integer paise only; rounding is always down."""
from datetime import date, timedelta

MONTHLY_CYCLE_DAYS = 28
MONTHLY_GUARANTEED_DAYS = 26
VISITS_PER_DAY = {"morning": 1, "evening": 1, "both": 2}


def visits_per_day(slot: str) -> int:
    try:
        return VISITS_PER_DAY[slot]
    except KeyError:
        raise ValueError(f"Unknown slot {slot!r}") from None


def per_visit_paise(rate_paise_per_person_hour: int, people: int, visit_minutes: int = 60) -> int:
    return rate_paise_per_person_hour * people * visit_minutes // 60


def custom_visit_dates(start: date, end: date, weekdays: set[int]) -> list[date]:
    """weekdays use Python numbering: Monday=0 … Sunday=6. Both ends inclusive."""
    return [start + timedelta(days=i) for i in range((end - start).days + 1) if (start + timedelta(days=i)).weekday() in weekdays]


def monthly_price(rate: int, people: int, slot: str, visit_minutes: int = 60) -> int:
    return per_visit_paise(rate, people, visit_minutes) * visits_per_day(slot) * MONTHLY_GUARANTEED_DAYS


def custom_price(rate: int, people: int, slot: str, start: date, end: date, weekdays: set[int], visit_minutes: int = 60) -> int:
    visits = len(custom_visit_dates(start, end, weekdays)) * visits_per_day(slot)
    return per_visit_paise(rate, people, visit_minutes) * visits
