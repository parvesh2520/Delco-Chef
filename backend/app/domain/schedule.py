"""Part C7: service-day schedule for Monthly and Custom time. Recomputed from inputs, so it stays correct
whenever off-days or missed days are added later."""
from dataclasses import dataclass
from datetime import date, timedelta

from app.domain.pricing import MONTHLY_CYCLE_DAYS, custom_visit_dates, visits_per_day

FLEXIBLE_DAYS = 2


@dataclass
class Schedule:
    service_dates: list[date]
    visits: int
    end_date: date
    forfeited_guaranteed_days: int
    extension_days: list[date]
    off_days: list[date]
    missed_days: list[date]
    free_off_days_left: int | None


def monthly(start: date, slot: str, off_days: set[date], missed: set[date]) -> Schedule:
    cycle = [start + timedelta(days=i) for i in range(MONTHLY_CYCLE_DAYS)]
    cycle_set = set(cycle)
    offs = sorted(d for d in off_days if d in cycle_set)
    miss = sorted(d for d in missed if d in cycle_set and d not in off_days)
    original_end = cycle[-1]
    extension = [original_end + timedelta(days=i + 1) for i in range(len(miss))]
    blocked = set(offs) | set(miss)
    dates = [d for d in cycle if d not in blocked] + extension
    return Schedule(dates, len(dates) * visits_per_day(slot), extension[-1] if extension else original_end,
                    max(0, len(offs) - FLEXIBLE_DAYS), extension, offs, miss, max(0, FLEXIBLE_DAYS - len(offs)))


def custom(start: date, end: date, weekdays: set[int], slot: str, off_days: set[date], missed: set[date]) -> Schedule:
    planned = custom_visit_dates(start, end, weekdays)
    planned_set = set(planned)
    offs = sorted(d for d in off_days if d in planned_set)
    miss = sorted(d for d in missed if d in planned_set and d not in off_days)
    extension: list[date] = []
    cursor = end
    while len(extension) < len(miss):
        cursor += timedelta(days=1)
        if cursor.weekday() in weekdays:
            extension.append(cursor)
    blocked = set(offs) | set(miss)
    dates = [d for d in planned if d not in blocked] + extension
    return Schedule(dates, len(dates) * visits_per_day(slot), extension[-1] if extension else end, 0, extension, offs,
                    miss, None)
