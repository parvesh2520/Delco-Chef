"""Repair open trial requests whose Trial / trial Visit rows are missing (e.g. deleted by hand in the database).

Such a request is stuck: Home and the service cards say "trial in progress" (they read the request), the Trials screen
says there is no trial (it reads trial rows), the customer can't request again (open request), and an admin can't
assign a chef (there is no visit to assign).

For each request in a stage that needs an open trial (request / trial2_requested) without that trial, this rebuilds
the trial (next trial number for the service, pending assignment) and its visit through the normal booking code, on
the request's start date or tomorrow if that has passed. Nothing else is touched. Idempotent and audited.

    python -m scripts.repair_orphan_trials            # dry run: report only
    python -m scripts.repair_orphan_trials --apply    # write the repair
"""
import sys
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import SessionLocal
from app.domain import ist_today
from app.models import ServiceRequest, Trial, Visit
from app.services import bookings
from app.services import settings as settings_svc
from app.services.events import Actor, audit, notify_admins

# Board stage -> number of trials the request must have, the last of them open.
NEEDS_OPEN_TRIAL = {"request": 1, "trial2_requested": 2}
REPAIR_ACTOR = Actor(None, "system", "repair script")


def find_orphans(db: Session) -> list[ServiceRequest]:
    out = []
    for r in db.scalars(select(ServiceRequest).where(ServiceRequest.stage.in_(NEEDS_OPEN_TRIAL)).order_by(ServiceRequest.id)):
        trials = db.scalars(select(Trial).where(Trial.request_id == r.id)).all()
        if len(trials) < NEEDS_OPEN_TRIAL[r.stage]:
            out.append(r)
    return out


def repair(db: Session, r: ServiceRequest) -> tuple[Trial, Visit]:
    s = settings_svc.load(db)
    number = bookings.trials_used(db, r.customer_id, r.service) + 1
    if number > s.int("max_free_trials"):
        raise ValueError(f"Request {r.id}: customer has no free trials left; close the request from the admin app instead.")
    t = Trial(request_id=r.id, customer_id=r.customer_id, service=r.service, number=number,
              status="pending_assignment" if r.stage == "request" else "requested")
    db.add(t)
    db.flush()
    day = max(r.start_date, ist_today() + timedelta(days=1))
    v = bookings.make_visit(db, r, s, day, bookings._slot_times(s, r.slot)[0], kind="trial", trial_id=t.id)
    audit(db, REPAIR_ACTOR, "Repaired missing trial", f"Request {r.id} → trial {t.id}, visit {v.id}",
          reason="Trial and visit rows were missing for an open request")
    notify_admins(db, "trial_requested", "Trial request needs a chef", f"Request {r.id} was repaired and is waiting for assignment.",
                  f"/admin/request/{r.id}")
    return t, v


def main(apply: bool) -> None:
    db = SessionLocal()
    try:
        orphans = find_orphans(db)
        if not orphans:
            print("No open requests with missing trials.")
            return
        for r in orphans:
            day = max(r.start_date, ist_today() + timedelta(days=1))
            print(f"Request {r.id} (customer {r.customer_id}, {r.service}, stage {r.stage}): missing trial; "
                  f"would create trial + {r.slot} visit on {day}")
            if apply:
                t, v = repair(db, r)
                print(f"  -> created trial {t.id} (#{t.number}) and visit {v.id}")
        if apply:
            db.commit()
            print("Repair committed.")
        else:
            db.rollback()
            print("Dry run only. Re-run with --apply to write.")
    finally:
        db.close()


if __name__ == "__main__":
    main("--apply" in sys.argv[1:])
