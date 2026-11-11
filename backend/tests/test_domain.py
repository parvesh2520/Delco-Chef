"""Pure business rules, no server or database (J3)."""
from datetime import date, datetime, time, timedelta, timezone

import pytest

from app.domain import board, ist_datetime
from app.domain.payouts import PayableVisit, chef_share, cycle_start
from app.domain.pricing import custom_price, monthly_price
from app.domain.ranking import BookingSlot, ChefCandidate, rank
from app.domain.refunds import RefundNotAllowed, refund_amount
from app.domain.schedule import custom, monthly

D = date(2026, 11, 12)
T = lambda h: ist_datetime(D, time(h))  # noqa: E731


def part_b_chefs():
    c = lambda i, n, lat, lng, r, j, **k: ChefCandidate(i, n, r, lat, lng, k.get("active", True), k.get("approved", True),  # noqa: E731
                                                       k.get("cu", {"North Indian"}), k.get("off", set()), k.get("busy", []), j)
    return [c(1, "Asha", 12.9716, 77.6412, 4.6, 6), c(2, "Esha", 12.9988, 77.6590, 4.4, 2), c(3, "Bala", 12.9352, 77.6245, 4.9, 0),
            c(4, "Dev", 12.9609, 77.6387, 4.5, 3, busy=[(T(18), T(19))]), c(5, "Chitra", 13.0827, 77.5877, 4.7, 1),
            c(6, "Farah", 12.9800, 77.6400, 4.8, 1, active=False), c(7, "Gopal", 12.9750, 77.6350, 4.6, 0, cu={"South Indian"}),
            c(8, "Hema", 12.9700, 77.6300, 4.9, 0, off={D}), c(9, "Isha", 12.9790, 77.6420, 4.8, 0, approved=False)]


def test_part_b_ranking_matches_expected_table():
    res = {s.name: s for s in rank(part_b_chefs(), BookingSlot(12.9784, 77.6408, T(19), T(20), D, ["North Indian"]))}
    eligible = [s for s in rank(part_b_chefs(), BookingSlot(12.9784, 77.6408, T(19), T(20), D, ["North Indian"])) if s.eligible]
    assert [s.name for s in eligible] == ["Asha", "Esha", "Bala"]
    for name, score, dist in (("Asha", 0.810, 0.76), ("Esha", 0.762, 3.01), ("Bala", 0.736, 5.12)):
        assert abs(res[name].score - score) <= 0.005 and abs(res[name].distance_km - dist) <= 0.01
    assert not res["Dev"].eligible and "buffer" in res["Dev"].reasons[0] and abs(res["Dev"].score - 0.802) <= 0.005
    assert "Beyond 8 km" in res["Chitra"].reasons[0]
    assert res["Farah"].reasons == ["Inactive"]
    assert "Cuisine" in res["Gopal"].reasons[0]
    assert "Off-day" in res["Hema"].reasons[0]
    assert "Not approved" in res["Isha"].reasons[0]


def test_tie_break_lower_distance_then_lower_id():
    a = ChefCandidate(2, "B", 5, 12.98, 77.64, True, True, {"X"})
    b = ChefCandidate(1, "A", 5, 12.98, 77.64, True, True, {"X"})
    out = rank([a, b], BookingSlot(12.98, 77.64, T(19), T(20), D, []))
    assert [x.chef_id for x in out] == [1, 2]


def test_monthly_price_and_both_slots():
    assert monthly_price(20000, 4, "morning") == 2_080_000
    assert monthly_price(20000, 4, "both") == 4_160_000


def test_custom_price_example():
    wk = {0, 1, 2, 3, 4, 5}
    assert custom_price(20000, 4, "morning", date(2026, 11, 2), date(2026, 11, 15), wk) == 960_000
    assert custom_price(20000, 4, "both", date(2026, 11, 2), date(2026, 11, 15), wk) == 1_920_000


def test_monthly_schedule_with_off_and_missed_days():
    s = monthly(date(2026, 11, 2), "morning", {date(2026, 11, 5), date(2026, 11, 12), date(2026, 11, 19)},
                {date(2026, 11, 9), date(2026, 11, 10)})
    assert s.forfeited_guaranteed_days == 1
    assert s.end_date == date(2026, 12, 1)
    assert s.extension_days == [date(2026, 11, 30), date(2026, 12, 1)]
    assert len(s.service_dates) == 25


def test_monthly_cycle_before_changes():
    s = monthly(date(2026, 11, 2), "morning", set(), set())
    assert s.service_dates[0] == date(2026, 11, 2) and s.end_date == date(2026, 11, 29)


def test_custom_schedule_and_missed_extension():
    s = custom(date(2026, 11, 2), date(2026, 11, 15), {0, 1, 2, 3, 4, 5}, "morning", set(), set())
    assert s.visits == 12 and date(2026, 11, 8) not in s.service_dates
    s2 = custom(date(2026, 11, 2), date(2026, 11, 15), {0, 1, 2, 3, 4, 5}, "morning", set(), {date(2026, 11, 14)})
    assert s2.end_date == date(2026, 11, 16)  # Sunday is skipped, next chosen weekday is Monday


@pytest.mark.parametrize("before,expected", [(timedelta(hours=1, minutes=59), 49_999), (timedelta(hours=2), 49_999),
                                             (timedelta(hours=3), 99_999)])
def test_refund_rule(before, expected):
    first = datetime(2026, 11, 2, 13, 30, tzinfo=timezone.utc)
    assert refund_amount(99_999, first, first - before) == expected


def test_refund_after_first_visit_not_allowed():
    first = datetime(2026, 11, 2, 13, 30, tzinfo=timezone.utc)
    with pytest.raises(RefundNotAllowed):
        refund_amount(1000, first, first + timedelta(minutes=1))


def test_board_refuses_request_to_payment_done():
    with pytest.raises(board.InvalidMove) as e:
        board.check(board.Stage.REQUEST, board.Stage.PAYMENT_DONE, "admin")
    assert e.value.code == "BOARD_INVALID_TRANSITION"
    with pytest.raises(board.InvalidMove) as e:
        board.check(board.Stage.SUBSCRIPTION_REQUESTED, board.Stage.PAYMENT_DONE, "admin")
    assert e.value.code == "BOARD_PAYMENT_ONLY"
    board.check(board.Stage.SUBSCRIPTION_REQUESTED, board.Stage.PAYMENT_DONE, "payment")


def test_payout_rules_part_g():
    assert chef_share(PayableVisit(1, 100_000, 60, 61, "subscription", False, False)) == 80_000
    assert chef_share(PayableVisit(2, 80_000, 60, 45, "subscription", False, False)) == 48_000
    assert chef_share(PayableVisit(3, 80_000, 60, None, "subscription", True, False)) == 0
    assert chef_share(PayableVisit(4, 100_000, 60, None, "subscription", False, True)) is None
    assert chef_share(PayableVisit(5, 0, 60, 60, "trial", False, False)) == 0
    # P5: Mon 12 Oct 00:30 IST is still Sunday in UTC, but belongs to the 12–18 Oct cycle.
    assert cycle_start(ist_datetime(date(2026, 10, 12), time(0, 30))) == date(2026, 10, 12)
    total = 80_000 + 48_000 - 5_000
    assert total == 123_000
