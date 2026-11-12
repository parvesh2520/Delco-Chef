"""Deployment settings: OTP codes in logs only when allowed, database credentials never logged, commit reported."""
from app.core.config import Settings
from app.core.logging import redact


def test_otp_codes_logged_outside_production_or_by_explicit_switch():
    assert Settings(ENVIRONMENT="development").otp_codes_in_log is True
    assert Settings(ENVIRONMENT="production").otp_codes_in_log is False
    assert Settings(ENVIRONMENT="production", OTP_LOG_CODES=True).otp_codes_in_log is True


def test_database_url_credentials_are_redacted():
    msg = 'connection to postgresql+psycopg2://owner:npg_s3cret@ep-x-pooler.ap-southeast-1.aws.neon.tech/db failed'
    out = redact(msg)
    assert "npg_s3cret" not in out and "owner" not in out and "postgresql+psycopg2://***@ep-x-pooler" in out


def test_git_commit_falls_back_to_render_variable(monkeypatch):
    monkeypatch.delenv("GIT_COMMIT", raising=False)
    monkeypatch.setenv("RENDER_GIT_COMMIT", "abcdef1234567890")
    assert Settings(_env_file=None).GIT_COMMIT == "abcdef123456"
    monkeypatch.setenv("GIT_COMMIT", "")  # what the Docker image holds when no build arg was given (Render)
    assert Settings(_env_file=None).GIT_COMMIT == "abcdef123456"
    monkeypatch.setenv("GIT_COMMIT", "ci-sha")  # an explicit value (CI build arg) wins
    assert Settings(_env_file=None).GIT_COMMIT == "ci-sha"
