"""Part B: chef eligibility and ranking.

score = w_rating·(rating/5) + w_distance·(1 − d/8) + w_workload·(1 − min(jobs,10)/10)
Ties: lower distance, then lower chef id.
"""
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta

from app.domain.geo import haversine_km


@dataclass(frozen=True)
class Weights:
    rating: float = 0.4
    distance: float = 0.4
    workload: float = 0.2


@dataclass
class ChefCandidate:
    chef_id: int
    name: str
    rating: float
    home_lat: float
    home_lng: float
    active: bool
    approved: bool
    cuisines: set[str]
    off_days: set[date] = field(default_factory=set)
    busy: list[tuple[datetime, datetime]] = field(default_factory=list)  # other assigned visits
    assignments_this_week: int = 0
    experience_years: int = 0


@dataclass
class BookingSlot:
    lat: float
    lng: float
    starts_at: datetime
    ends_at: datetime
    service_date: date  # IST date of the visit
    cuisines: list[str]


@dataclass
class Suggestion:
    chef_id: int
    name: str
    rating: float
    distance_km: float
    jobs_this_week: int
    eligible: bool
    reasons: list[str]
    score: float
    parts: dict[str, float]
    experience_years: int
    cuisines: list[str]


def score_parts(rating: float, distance_km: float, jobs: int, w: Weights, radius_km: float = 8.0) -> dict[str, float]:
    return {
        "rating": w.rating * (rating / 5),
        "distance": w.distance * (1 - distance_km / radius_km),
        "workload": w.workload * (1 - min(jobs, 10) / 10),
    }


def overlaps(a_start: datetime, a_end: datetime, b_start: datetime, b_end: datetime, buffer: timedelta) -> bool:
    """True when two visits are closer than the travel buffer (buffer applies before and after each visit)."""
    return a_start < b_end + buffer and b_start < a_end + buffer


def rank(candidates: list[ChefCandidate], booking: BookingSlot, *, weights: Weights = Weights(),
         radius_km: float = 8.0, buffer_minutes: int = 60) -> list[Suggestion]:
    buffer = timedelta(minutes=buffer_minutes)
    wanted = {c.lower() for c in booking.cuisines}
    out: list[Suggestion] = []
    for c in candidates:
        d = haversine_km(booking.lat, booking.lng, c.home_lat, c.home_lng)
        reasons: list[str] = []
        if not c.approved:
            reasons.append("Not approved: documents not yet approved")
        if not c.active:
            reasons.append("Inactive")
        if wanted and not wanted & {x.lower() for x in c.cuisines}:
            reasons.append(f"Cuisine not supported ({', '.join(booking.cuisines)})")
        if booking.service_date in c.off_days:
            reasons.append("Off-day on the requested date")
        if d > radius_km:
            reasons.append(f"Beyond {radius_km:g} km ({d:.2f} km away)")
        clash = next((b for b in c.busy if overlaps(booking.starts_at, booking.ends_at, b[0], b[1], buffer)), None)
        if clash:
            reasons.append(f"The {buffer_minutes}-minute travel buffer overlaps another booking")
        parts = score_parts(c.rating, d, c.assignments_this_week, weights, radius_km)
        out.append(Suggestion(c.chef_id, c.name, c.rating, round(d, 2), c.assignments_this_week, not reasons, reasons,
                              round(sum(parts.values()), 3), {k: round(v, 3) for k, v in parts.items()},
                              c.experience_years, sorted(c.cuisines)))
    eligible = sorted((s for s in out if s.eligible), key=lambda s: (-s.score, s.distance_km, s.chef_id))
    rest = sorted((s for s in out if not s.eligible), key=lambda s: (s.distance_km, s.chef_id))
    return eligible + rest
