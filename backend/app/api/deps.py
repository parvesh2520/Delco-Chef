"""Authentication and role checks, applied server-side on every protected endpoint (A4)."""
from dataclasses import dataclass

import jwt
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import AppError
from app.core.security import decode_access_token
from app.models import Chef, User
from app.services import auth as auth_svc
from app.services.events import Actor

ADMIN_ROLES = ("ops_admin", "super_admin")


@dataclass
class Principal:
    user: User
    session_id: str

    @property
    def actor(self) -> Actor:
        return Actor.of(self.user)

    @property
    def is_admin(self) -> bool:
        return self.user.role in ADMIN_ROLES


def current(request: Request, db: Session = Depends(get_db)) -> Principal:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise AppError("UNAUTHENTICATED", "Sign in to continue.", 401)
    try:
        payload = decode_access_token(header[7:])
    except jwt.ExpiredSignatureError:
        raise AppError("TOKEN_EXPIRED", "Session expired.", 401) from None
    except jwt.PyJWTError:
        raise AppError("UNAUTHENTICATED", "Invalid session.", 401) from None
    row = db.execute(select(User, auth_svc.session_active_clause(payload["sid"])).where(User.id == int(payload["sub"]))).first()
    user, live = (row[0], row[1]) if row else (None, False)
    if not user or user.status != "active" or user.role != payload.get("role"):
        raise AppError("UNAUTHENTICATED", "Invalid session.", 401)
    if not live:
        raise AppError("SESSION_REVOKED", "You have been signed out.", 401)
    return Principal(user, payload["sid"])


def roles(*allowed: str):
    def dep(p: Principal = Depends(current)) -> Principal:
        if p.user.role not in allowed:
            raise AppError("FORBIDDEN", "You do not have access to this.", 403)
        return p
    return dep


customer_only = roles("customer")
chef_only = roles("chef")
admin_only = roles(*ADMIN_ROLES)
super_admin_only = roles("super_admin")


def current_chef(p: Principal = Depends(chef_only), db: Session = Depends(get_db)) -> Chef:
    chef = db.scalar(select(Chef).where(Chef.user_id == p.user.id))
    if not chef:
        raise AppError("CHEF_NOT_FOUND", "Chef profile not found.", 404)
    return chef


def approved_chef(chef: Chef = Depends(current_chef)) -> Chef:
    if chef.status != "approved":
        raise AppError("CHEF_NOT_APPROVED", "Your application has not been approved yet.", 403)
    return chef
