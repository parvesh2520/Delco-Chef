import os
from functools import cached_property
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Infrastructure configuration only. Business tunables live in the system_settings table."""

    PROJECT_NAME: str = "Delco Chefs API"
    VERSION: str = "1.0.0"
    # Set by CI (docker build arg); on Render the runtime variable RENDER_GIT_COMMIT is used when GIT_COMMIT is unset.
    GIT_COMMIT: str = ""

    @field_validator("GIT_COMMIT")
    @classmethod
    def _commit(cls, v: str) -> str:
        return v or os.environ.get("RENDER_GIT_COMMIT", "")[:12] or "dev"
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
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30  # sliding: every refresh extends the session by this much
    # A refresh token that was just rotated may be presented once more within this window (the phone lost the response).
    REFRESH_REUSE_GRACE_SECONDS: int = 300

    OTP_PROVIDER: str = "log"  # log | (future: msg91, twilio…)
    # The mock "log" provider writes the code to the server log outside production. In production it does not, unless
    # this is set to true: a deliberate switch for a demo deployment with no SMS provider (read codes in the host's log).
    OTP_LOG_CODES: bool = False
    # Optional: also append logs to this file (relative paths resolve from the backend folder), e.g. server.log.
    # Ignored when ENVIRONMENT=test.
    LOG_FILE: str | None = None

    # Razorpay test mode. When absent, development uses the local sandbox gateway.
    RAZORPAY_KEY_ID: str | None = None
    RAZORPAY_KEY_SECRET: str | None = None
    RAZORPAY_WEBHOOK_SECRET: str | None = None
    SANDBOX_WEBHOOK_SECRET: str = "dev-sandbox-webhook-secret"

    MEDIA_ROOT: str = "media"
    # Persistent private object storage (S3-compatible: Cloudflare R2, AWS S3, Backblaze B2…). When S3_BUCKET is set,
    # photos, chef documents and data exports go there instead of MEDIA_ROOT. Leave empty for local disk.
    S3_BUCKET: str | None = None
    S3_ENDPOINT_URL: str | None = None  # R2: https://<account-id>.r2.cloudflarestorage.com ; AWS: leave empty
    S3_REGION: str = "auto"             # R2: auto ; AWS: e.g. ap-south-1
    S3_ACCESS_KEY_ID: str | None = None
    S3_SECRET_ACCESS_KEY: str | None = None
    RUN_WORKERS: bool = True  # background outbox / location flush / scheduled jobs

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=True, extra="ignore")

    @cached_property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @cached_property
    def otp_codes_in_log(self) -> bool:
        return not self.is_production or self.OTP_LOG_CODES

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
