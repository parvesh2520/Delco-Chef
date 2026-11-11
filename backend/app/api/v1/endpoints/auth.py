from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import Principal, current
from app.api.schemas import LogoutIn, OtpRequest, OtpVerify, RefreshIn
from app.core.database import get_db
from app.core.security import secret_hash
from app.models import RefreshToken
from app.services import auth as svc

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/otp/request", summary="Send a 6-digit OTP (mock provider logs it in development)")
def request_otp(body: OtpRequest, db: Session = Depends(get_db)):
    return svc.request_otp(db, body.phone, body.portal)


@router.post("/otp/verify", summary="Verify OTP → access + refresh tokens. Never creates an admin.")
def verify_otp(body: OtpVerify, db: Session = Depends(get_db)):
    return svc.verify_otp(db, body.phone, body.code, body.portal, body.device)


@router.post("/refresh", summary="Rotate the refresh token")
def refresh(body: RefreshIn, db: Session = Depends(get_db)):
    return svc.refresh(db, body.refreshToken)


@router.get("/me", summary="Current session (used to restore the app after restart)")
def me(p: Principal = Depends(current), db: Session = Depends(get_db)):
    return svc.session_payload(db, p.user)


@router.post("/logout", status_code=204, summary="Revoke this session's refresh tokens")
def logout(body: LogoutIn, p: Principal = Depends(current), db: Session = Depends(get_db)):
    sid = p.session_id
    if body.refreshToken:
        rt = db.query(RefreshToken).filter(RefreshToken.token_hash == secret_hash(body.refreshToken),
                                           RefreshToken.user_id == p.user.id).first()
        sid = rt.session_id if rt else sid
    svc.revoke_session(db, p.user.id, sid)
    db.commit()


@router.get("/sessions", summary="Active sessions (A13)")
def sessions(p: Principal = Depends(current), db: Session = Depends(get_db)):
    return svc.list_sessions(db, p.user.id, p.session_id)


@router.delete("/sessions/{session_id}", status_code=204, summary="Sign out one session")
def end_session(session_id: str, p: Principal = Depends(current), db: Session = Depends(get_db)):
    svc.revoke_session(db, p.user.id, session_id)
    db.commit()
