"""Business settings (J3: changeable without a release). Defaults live here; overrides in system_settings."""
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.core.errors import AppError
from app.models import SystemSetting


@dataclass(frozen=True)
class Field:
    key: str
    label: str
    default: str
    unit: str | None = None
    kind: str = "int"  # int | float | bool | hhmm
    hint: str | None = None
    min: float | None = None
    max: float | None = None


SECTIONS: list[dict] = [
    {"key": "pricing", "title": "Pricing", "icon": "pricetag-outline",
     "description": "Subscription price = rate × people × visits. New orders only; existing links keep their amount.",
     "fields": [Field("rate_paise_per_person_hour", "Rate per person per hour", "20000", "paise", min=100, max=1_000_000,
                      hint="20000 paise = ₹200")]},
    {"key": "trials", "title": "Free trials", "icon": "gift-outline",
     "description": "Trial limit applies separately to each subscription service.",
     "fields": [Field("max_free_trials", "Maximum free trials per service", "2", min=1, max=2,
                      hint="Database allows at most 2 (trial #1 and #2)."),
                Field("trial_max_people", "Maximum people on a trial", "4", min=1, max=7)]},
    {"key": "assignment", "title": "Assignment", "icon": "navigate-outline", "description": "Who is eligible for a booking.",
     "fields": [Field("radius_km", "Assignment radius", "8", "km", "float", min=1, max=50),
                Field("travel_buffer_min", "Travel buffer before/after each visit", "60", "min", min=0, max=240),
                Field("chef_response_min", "Chef response timeout", "10", "min", min=1, max=120),
                Field("auto_assign", "Auto-confirm top chef (0 = off, 1 = on)", "0", kind="bool")]},
    {"key": "ranking", "title": "Chef ranking weights", "icon": "podium-outline", "description": "Weights should add up to 1.",
     "fields": [Field("w_rating", "Rating weight", "0.4", kind="float", min=0, max=1),
                Field("w_distance", "Distance weight", "0.4", kind="float", min=0, max=1),
                Field("w_workload", "Workload weight", "0.2", kind="float", min=0, max=1)]},
    {"key": "check_in", "title": "Check-in rules", "icon": "location-outline", "description": "Geofence, time window and GPS quality.",
     "fields": [Field("checkin_radius_m", "Check-in radius", "200", "m", min=20, max=2000),
                Field("checkin_window_min", "Window before/after start", "30", "min", min=5, max=180),
                Field("max_gps_accuracy_m", "Worst accepted GPS accuracy", "100", "m", min=5, max=1000),
                Field("max_code_attempts", "Wrong code attempts before lock", "5", min=1, max=10),
                Field("auto_close_after_min", "Auto-close forgotten check-out after end", "30", "min", min=5, max=240)]},
    {"key": "tracking", "title": "Tracking", "icon": "radio-outline", "description": "Live location while the chef travels.",
     "fields": [Field("tracking_window_min", "Visible to customer before start", "15", "min", min=5, max=120),
                Field("avg_speed_kmh", "Average travel speed (ETA)", "20", "km/h", "float", min=5, max=80),
                Field("ping_interval_s", "Location update interval", "5", "sec", min=2, max=60),
                Field("stale_after_s", "Show 'Reconnecting' after", "30", "sec", min=10, max=300)]},
    {"key": "payment_link", "title": "Payments & refunds", "icon": "link-outline", "description": "Payment links and cancellation refunds.",
     "fields": [Field("link_validity_h", "Payment link validity", "48", "hours", min=1, max=168),
                Field("unpaid_close_days", "Close unpaid requests after", "7", "days", min=1, max=30),
                Field("refund_full_before_h", "Full refund if cancelled more than", "2", "hours before", "float", min=0, max=72),
                Field("refund_partial_pct", "Otherwise refund", "50", "%", min=0, max=100),
                Field("chef_share_pct", "Chef share of booking amount", "80", "%", min=0, max=100)]},
    {"key": "slots", "title": "Slot timings", "icon": "time-outline", "description": "Each visit is one hour long.",
     "fields": [Field("slot_morning", "Morning start", "07:00", "IST", "hhmm"),
                Field("slot_evening", "Evening start", "19:00", "IST", "hhmm"),
                Field("visit_minutes", "Visit length", "60", "min", min=30, max=180)]},
]
FIELDS: dict[str, Field] = {f.key: f for s in SECTIONS for f in s["fields"]}


class Settings:
    """Snapshot of settings for the duration of one request/job."""

    def __init__(self, values: dict[str, str]):
        self._v = values

    def raw(self, key: str) -> str:
        return self._v.get(key, FIELDS[key].default)

    def int(self, key: str) -> int:
        return int(float(self.raw(key)))

    def float(self, key: str) -> float:
        return float(self.raw(key))

    def bool(self, key: str) -> bool:
        return self.raw(key) in ("1", "true", "True", "on")


def load(db: Session) -> Settings:
    return Settings({s.key: s.value for s in db.scalars(select(SystemSetting))})


def sections(db: Session) -> list[dict]:
    cur = load(db)
    return [{"key": s["key"], "title": s["title"], "description": s["description"], "icon": s["icon"],
             "fields": [{"key": f.key, "label": f.label, "value": cur.raw(f.key), "unit": f.unit, "hint": f.hint,
                         "keyboard": "default" if f.kind == "hhmm" else "numeric"} for f in s["fields"]]}
            for s in SECTIONS]


def _validate(f: Field, value: str) -> str:
    value = value.strip()
    try:
        if f.kind == "hhmm":
            h, m = value.split(":")
            if not (0 <= int(h) < 24 and 0 <= int(m) < 60):
                raise ValueError
            return f"{int(h):02d}:{int(m):02d}"
        num = float(value)
        if f.kind == "bool":
            if num not in (0, 1):
                raise ValueError
            return str(int(num))
        if f.kind == "int" and num != int(num):
            raise ValueError
        if (f.min is not None and num < f.min) or (f.max is not None and num > f.max):
            raise AppError("SETTING_OUT_OF_RANGE", f"{f.label} must be between {f.min:g} and {f.max:g}.", 422, fields={f.key: "out of range"})
        return str(int(num)) if f.kind == "int" else str(num)
    except AppError:
        raise
    except Exception:
        raise AppError("SETTING_INVALID", f"{f.label}: invalid value.", 422, fields={f.key: "invalid"}) from None


def save_section(db: Session, section_key: str, values: dict[str, str], user_id: int) -> list[tuple[str, str, str]]:
    section = next((s for s in SECTIONS if s["key"] == section_key), None)
    if not section:
        raise AppError("SETTINGS_UNKNOWN_SECTION", "Unknown settings section.", 404)
    cur = load(db)
    changes = []
    for f in section["fields"]:
        if f.key in values:
            new = _validate(f, str(values[f.key]))
            if new != cur.raw(f.key):
                changes.append((f.key, cur.raw(f.key), new))
                db.execute(insert(SystemSetting).values(key=f.key, value=new, updated_by=user_id)
                           .on_conflict_do_update(index_elements=["key"], set_={"value": new, "updated_by": user_id}))
    if section_key == "ranking":
        w = load(db)
        total = w.float("w_rating") + w.float("w_distance") + w.float("w_workload")
        if abs(total - 1) > 0.001:
            raise AppError("SETTING_WEIGHTS_SUM", "Ranking weights must add up to 1.", 422)
    return changes


def slot_options(s: Settings) -> list[dict]:
    m, e = s.raw("slot_morning"), s.raw("slot_evening")
    return [{"value": "morning", "label": f"Morning · {m}"}, {"value": "evening", "label": f"Evening · {e}"},
            {"value": "both", "label": f"Both · {m} & {e}"}]
