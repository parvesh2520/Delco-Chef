"""Customer ratings of completed visits. The chef's `rating` is kept equal to the average of their visit ratings."""
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import AppError, not_found
from app.models import Chef, Visit, VisitRating

ALREADY_RATED = ("ALREADY_RATED", "You have already rated this visit.", 409)


def rate_visit(db: Session, customer_id: int, visit_id: int, stars: int, comment: str | None) -> VisitRating:
    v = db.get(Visit, visit_id)
    if not v or v.customer_id != customer_id:
        raise not_found("Visit")
    if v.status != "completed" or not v.chef_id:
        raise AppError("RATING_NOT_ALLOWED", "You can rate a visit once it is completed.", 409)
    if db.get(VisitRating, visit_id):
        raise AppError(*ALREADY_RATED)
    rating = VisitRating(visit_id=v.id, customer_id=customer_id, chef_id=v.chef_id, stars=stars,
                         comment=(comment or "").strip() or None)
    db.add(rating)
    try:
        db.flush()
    except IntegrityError:  # a concurrent double-submit for the same visit
        db.rollback()
        raise AppError(*ALREADY_RATED)
    # Lock the chef row so two ratings landing together both count in the stored average.
    chef = db.scalar(select(Chef).where(Chef.id == v.chef_id).with_for_update())
    avg = db.scalar(select(func.avg(VisitRating.stars)).where(VisitRating.chef_id == v.chef_id))
    chef.rating = Decimal(avg).quantize(Decimal("0.01"))
    db.commit()
    return rating


def rating_json(r: VisitRating | None) -> dict | None:
    return {"stars": r.stars, "comment": r.comment, "createdAt": r.created_at.isoformat()} if r else None
