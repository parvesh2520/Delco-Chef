"""The pool pings only connections that sat idle; one dropped by the server while idle is replaced transparently.
Each test uses its own one-connection engine with the app's idle-ping listeners, so the shared pool is never touched."""
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.pool import NullPool

from app.core.database import engine as app_engine, install_idle_ping


@pytest.fixture
def eng():
    e = create_engine(app_engine.url, pool_size=1, max_overflow=0)
    install_idle_ping(e)
    yield e
    e.dispose()


def kill(pid: int) -> None:
    """Close a backend from the server side, as Neon does with idle connections."""
    killer = create_engine(app_engine.url, poolclass=NullPool)
    with killer.connect() as k:
        assert k.execute(text("select pg_terminate_backend(:p)"), {"p": pid}).scalar()
    killer.dispose()


def pid_of(e) -> int:
    with e.connect() as c:
        return c.execute(text("select pg_backend_pid()")).scalar()


def test_idle_connection_dropped_by_server_is_replaced(eng):
    pid = pid_of(eng)
    kill(pid)
    for rec in list(eng.pool._pool.queue):
        rec.info["idle_since"] = 0  # idle past the threshold
    with eng.connect() as c:  # pinged, found dead, replaced: the request succeeds
        assert c.execute(text("select 1")).scalar() == 1
        assert c.execute(text("select pg_backend_pid()")).scalar() != pid


def test_recently_used_connection_is_handed_out_without_a_ping(eng):
    pid = pid_of(eng)
    kill(pid)
    # Used moments ago, so no ping round-trip: the dead connection is handed out as is and the query fails.
    with pytest.raises(OperationalError):
        with eng.connect() as c:
            c.execute(text("select 1"))
    with eng.connect() as c:  # the pool discarded it; the next request gets a fresh connection
        assert c.execute(text("select 1")).scalar() == 1
