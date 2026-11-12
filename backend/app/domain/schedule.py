"""Part C7: service-day schedule for Monthly and Custom time. Recomputed from inputs, so it stays correct
whenever off-days or missed days are added later."""
from collections.abc import Callable
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


def _apply(planned: list[date], off_days: set[date], missed: set[date], next_day: Callable[[date], date]):
    """Each missed day adds one day after the current end. An added day can itself be missed (it extends again) or
    marked off (it is simply not served), so extend until every missed day in the plan has its replacement."""
    extension: list[date] = []
    while True:
        horizon = set(planned) | set(extension)
        miss = sorted(d for d in missed if d in horizon and d not in off_days)
        if len(extension) >= len(miss):
            break
        extension.append(next_day(extension[-1] if extension else planned[-1]))
    offs = sorted(d for d in off_days if d in horizon)
    blocked = set(offs) | set(miss)
    dates = [d for d in planned + extension if d not in blocked]
    end = extension[-1] if extension else planned[-1]
    return dates, end, extension, offs, miss


def monthly(start: date, slot: str, off_days: set[date], missed: set[date]) -> Schedule:
    cycle = [start + timedelta(days=i) for i in range(MONTHLY_CYCLE_DAYS)]
    dates, end, extension, offs, miss = _apply(cycle, off_days, missed, lambda d: d + timedelta(days=1))
    return Schedule(dates, len(dates) * visits_per_day(slot), end, max(0, len(offs) - FLEXIBLE_DAYS), extension, offs, miss,
                    max(0, FLEXIBLE_DAYS - len(offs)))


def custom(start: date, end: date, weekdays: set[int], slot: str, off_days: set[date], missed: set[date]) -> Schedule:
    planned = custom_visit_dates(start, end, weekdays)
    if not planned:
        return Schedule([], 0, end, 0, [], [], [], None)

    def next_weekday(d: date) -> date:
        d += timedelta(days=1)
        while d.weekday() not in weekdays:
            d += timedelta(days=1)
        return d

    dates, last, extension, offs, miss = _apply(planned, off_days, missed, next_weekday)
    return Schedule(dates, len(dates) * visits_per_day(slot), last if extension else end, 0, extension, offs, miss, None)
