"""Part C admin board: one card per customer per service. Only these moves are valid."""
from enum import StrEnum


class Stage(StrEnum):
    REQUEST = "request"
    TRIAL1_SCHEDULED = "trial1_scheduled"
    TRIAL1_AWAITING = "trial1_awaiting_decision"
    TRIAL2_REQUESTED = "trial2_requested"
    TRIAL2_SCHEDULED = "trial2_scheduled"
    TRIAL2_AWAITING = "trial2_awaiting_decision"
    SUBSCRIPTION_REQUESTED = "subscription_requested"
    PAYMENT_DONE = "payment_done"
    CLOSED = "closed"


OPEN_STAGES = frozenset(Stage) - {Stage.CLOSED, Stage.PAYMENT_DONE}

# (from, to) -> who may trigger it. "system" moves are never accepted from a manual board drag.
TRANSITIONS: dict[tuple[Stage, Stage], str] = {
    (Stage.REQUEST, Stage.TRIAL1_SCHEDULED): "admin_assign",
    (Stage.REQUEST, Stage.CLOSED): "admin_or_customer",
    (Stage.TRIAL1_SCHEDULED, Stage.TRIAL1_AWAITING): "system",
    (Stage.TRIAL1_AWAITING, Stage.SUBSCRIPTION_REQUESTED): "customer",
    (Stage.TRIAL1_AWAITING, Stage.TRIAL2_REQUESTED): "customer",
    (Stage.TRIAL1_AWAITING, Stage.TRIAL2_SCHEDULED): "admin_push",
    (Stage.TRIAL2_REQUESTED, Stage.TRIAL2_SCHEDULED): "admin_assign",
    (Stage.TRIAL2_SCHEDULED, Stage.TRIAL2_AWAITING): "system",
    (Stage.TRIAL2_AWAITING, Stage.SUBSCRIPTION_REQUESTED): "customer",
    (Stage.TRIAL2_AWAITING, Stage.CLOSED): "customer",
    (Stage.SUBSCRIPTION_REQUESTED, Stage.PAYMENT_DONE): "payment",
    (Stage.SUBSCRIPTION_REQUESTED, Stage.CLOSED): "admin_or_customer",
    # A customer cancelling a pushed/requested second trial returns the card to the decision column.
    (Stage.TRIAL2_SCHEDULED, Stage.TRIAL1_AWAITING): "customer_cancel",
    (Stage.TRIAL2_REQUESTED, Stage.TRIAL1_AWAITING): "customer_cancel",
    (Stage.TRIAL1_SCHEDULED, Stage.CLOSED): "customer_cancel",
}

# Moves an Admin may make by hand on the board (everything else needs its own action/endpoint).
MANUAL_ADMIN_MOVES = {(Stage.REQUEST, Stage.CLOSED), (Stage.SUBSCRIPTION_REQUESTED, Stage.CLOSED)}


class InvalidMove(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def check(frm: Stage, to: Stage, actor: str) -> None:
    rule = TRANSITIONS.get((frm, to))
    if rule is None:
        raise InvalidMove("BOARD_INVALID_TRANSITION", f"Cannot move a card from {frm.value} to {to.value}.")
    if rule == "payment" and actor != "payment":
        raise InvalidMove("BOARD_PAYMENT_ONLY", "Payment done is set only by a confirmed payment.")
    if rule == "system" and actor != "system":
        raise InvalidMove("BOARD_SYSTEM_ONLY", "This move happens automatically when the visit is completed.")
    allowed = {"admin_assign": {"admin_assign"}, "admin_push": {"admin_push"}, "customer": {"customer"},
               "customer_cancel": {"customer_cancel"}, "admin_or_customer": {"admin", "customer", "system"},
               "system": {"system"}, "payment": {"payment"}}[rule]
    if actor not in allowed:
        raise InvalidMove("BOARD_INVALID_TRANSITION", f"Cannot move a card from {frm.value} to {to.value} this way.")
