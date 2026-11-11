"""Audit log + notification outbox. Both are written inside the caller's transaction, so they commit (or roll back)
atomically with the business change. Delivery happens later in the worker (services/worker.py)."""
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import AuditLog, OutboxEvent, User


@dataclass
class Actor:
    id: int | None
    role: str
    name: str | None = None

    @classmethod
    def of(cls, user: User) -> "Actor":
        return cls(user.id, user.role, user.full_name)


SYSTEM = Actor(None, "system", "System")


def audit(db: Session, actor: Actor, action: str, target: str, *, reason: str | None = None, meta: dict | None = None) -> None:
    db.add(AuditLog(actor_id=actor.id, actor_role=actor.role, actor_name=actor.name, action=action, target=target,
                    reason=reason, meta=meta))


def notify(db: Session, event: str, user_id: int | None, title: str, body: str, href: str | None = None, *,
           channels: tuple[str, ...] = ("push",)) -> None:
    """Queue one notification for one user. `channels` beyond in-app are delivered by mock adapters (log)."""
    if user_id is None:
        return
    db.add(OutboxEvent(event=event, payload={"user_id": user_id, "title": title, "body": body, "href": href,
                                             "channels": list(channels)}))


def notify_admins(db: Session, event: str, title: str, body: str, href: str | None = None) -> None:
    from sqlalchemy import select
    for uid in db.scalars(select(User.id).where(User.role.in_(("ops_admin", "super_admin")), User.status == "active")):
        notify(db, event, uid, title, body, href)
