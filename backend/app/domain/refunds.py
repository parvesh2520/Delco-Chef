"""Part F5 cancellation refund rule."""
from datetime import datetime, timedelta


class RefundNotAllowed(ValueError):
    pass


def refund_amount(amount_paise: int, first_visit_at: datetime, cancelled_at: datetime, *,
                  full_refund_before_hours: float = 2, partial_percent: int = 50) -> int:
    """More than the threshold before the first visit → full. At or within it (exactly 2h counts) → partial,
    rounded down to the paisa. After the first visit started → not covered by this rule."""
    if cancelled_at >= first_visit_at:
        raise RefundNotAllowed("Cancellation after the first visit is not refundable by this rule.")
    if first_visit_at - cancelled_at > timedelta(hours=full_refund_before_hours):
        return amount_paise
    return amount_paise * partial_percent // 100
