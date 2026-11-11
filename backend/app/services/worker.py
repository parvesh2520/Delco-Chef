"""In-process background worker (free-tier friendly; no Redis needed).

- Outbox: claims rows with FOR UPDATE SKIP LOCKED, so several instances never deliver the same event twice.
- Location flush: batches buffered tracking points into one INSERT every 2 s.
- Scheduled jobs: chef-offer expiry, attendance auto-close, link expiry, payout cycle, location retention.
"""
import logging
import threading
import time
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models import Notification, OutboxEvent

log = logging.getLogger("worker")
_stop = threading.Event()


def deliver_outbox(limit: int = 50) -> int:
    db = SessionLocal()
    try:
        events = db.scalars(select(OutboxEvent).where(OutboxEvent.status == "pending",
                                                      OutboxEvent.available_at <= datetime.now(timezone.utc))
                            .order_by(OutboxEvent.id).limit(limit).with_for_update(skip_locked=True)).all()
        for ev in events:
            try:
                with db.begin_nested():
                    if ev.event == "build_export":
                        from app.services.privacy import run_export
                        run_export(db, ev.payload["export_id"])
                    elif ev.event == "schedule_subscription":
                        from app.models import Subscription
                        from app.services.subscriptions import sync_visits
                        sub = db.get(Subscription, ev.payload["subscription_id"])
                        if sub and sub.status == "active":
                            sync_visits(db, sub)
                    else:
                        p = ev.payload
                        db.add(Notification(user_id=p["user_id"], title=p["title"], body=p["body"], href=p.get("href"), event=ev.event))
                        for ch in p.get("channels", []):
                            if ch in ("sms", "email"):  # mock adapters: log a line, never the phone/email itself
                                log.info("MOCK %s to user %s: %s", ch.upper(), p["user_id"], p["title"])
                    ev.status, ev.processed_at = "done", datetime.now(timezone.utc)
            except Exception as e:  # noqa: BLE001 — one bad event must not block the queue
                ev.attempts += 1
                ev.last_error = str(e)[:300]
                ev.status = "failed" if ev.attempts >= 5 else "pending"
                log.exception("Outbox event %s failed", ev.id)
        db.commit()
        return len(events)
    finally:
        db.close()


def _run(name: str, fn, *args) -> None:
    db = SessionLocal()
    try:
        fn(db, *args)
    except Exception:  # noqa: BLE001
        db.rollback()
        log.exception("Job %s failed", name)
    finally:
        db.close()


def _loop() -> None:
    from app.services import attendance, bookings, payments, payouts, tracking
    last = {"minute": 0.0, "hour": 0.0, "day": 0.0}
    while not _stop.is_set():
        try:
            deliver_outbox()
        except Exception:  # noqa: BLE001
            log.exception("Outbox loop failed")
        _run("location_flush", tracking.flush)
        t = time.monotonic()
        if t - last["minute"] >= 60:
            last["minute"] = t
            _run("expire_offers", bookings.expire_unanswered)
            _run("attendance_auto_close", attendance.auto_close)
            _run("payment_link_expiry", payments.expire_links_and_close_unpaid)
        if t - last["hour"] >= 3600:
            last["hour"] = t
            _run("payout_cycle", payouts.run_due)
        if t - last["day"] >= 86400:
            last["day"] = t
            _run("location_retention", tracking.purge_old)
        _stop.wait(2)


def start() -> threading.Thread:
    _stop.clear()
    th = threading.Thread(target=_loop, name="delco-worker", daemon=True)
    th.start()
    return th


def stop() -> None:
    _stop.set()
