from functools import cached_property
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Infrastructure configuration only. Business tunables live in the system_settings table."""

    PROJECT_NAME: str = "Delco Chefs API"
    VERSION: str = "1.0.0"
    GIT_COMMIT: str = "dev"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"  # development | test | production
    DEBUG: bool = False

    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # Neon: pooled URL for the app, direct URL for Alembic.
    DATABASE_URL: str = "postgresql+psycopg2://delco:delco@localhost:5432/delco"
    DIRECT_URL: str | None = None
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 5
    DB_PREFER_IPV4: bool = False  # set true where IPv6 to the DB host times out (slow first connections)

    BACKEND_CORS_ORIGINS: list[str] = []
    PUBLIC_BASE_URL: str = "http://localhost:8000"

    # Secrets — must be overridden outside development.
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    # 32-byte keys, base64 (urlsafe). Generate: python -c "import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
    FIELD_ENCRYPTION_KEY: str = "ZGV2LWZpZWxkLWVuY3J5cHRpb24ta2V5LTMyYnl0ZXM="
    HMAC_LOOKUP_KEY: str = "ZGV2LWhtYWMtbG9va3VwLWtleS0wMDAwMDAwMDAwMDA="

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    OTP_PROVIDER: str = "log"  # log | (future: msg91, twilio…)

    # Razorpay test mode. When absent, development uses the local sandbox gateway.
    RAZORPAY_KEY_ID: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None
    RAZORPAY_WEBHOOK_SECRET: str | None = None
    SANDBOX_WEBHOOK_SECRET: str = "dev-sandbox-webhook-secret"

    MEDIA_ROOT: str = "media"
    RUN_WORKERS: bool = True  # background outbox / location flush / scheduled jobs

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore")

    @cached_property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @cached_property
    def sqlalchemy_url(self) -> str:
        return _driver(self.DATABASE_URL)

    @cached_property
    def migration_url(self) -> str:
        return _driver(self.DIRECT_URL or self.DATABASE_URL)

    def validate_production(self) -> None:
        if not self.is_production:
            return
        weak = [k for k in ("SECRET_KEY", "FIELD_ENCRYPTION_KEY", "HMAC_LOOKUP_KEY") if "dev" in getattr(self, k) or getattr(self, k) == Settings.model_fields[k].default]
        if weak:
            raise RuntimeError(f"Refusing to start in production with development secrets: {', '.join(weak)}")


def _driver(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg2://" + url[len("postgresql://"):]
    return url


settings = Settings()
