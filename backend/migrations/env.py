from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine, pool

from app.core.config import settings
from app.models import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    # Only manage our own tables in `public`. Never touch Neon-managed schemas (e.g. neon_auth).
    if type_ == "table" and getattr(obj, "schema", None) not in (None, "public"):
        return False
    if type_ == "table" and reflected and compare_to is None:
        return False  # tables we don't own are left alone, never dropped
    return True


def run_migrations_offline() -> None:
    context.configure(url=settings.migration_url, target_metadata=target_metadata, literal_binds=True,
                      include_object=include_object)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = config.attributes.get("url") or settings.migration_url
    engine = create_engine(url, poolclass=pool.NullPool)
    if settings.DB_PREFER_IPV4:
        from app.core.database import prefer_ipv4
        prefer_ipv4(engine)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, include_object=include_object,
                          compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
