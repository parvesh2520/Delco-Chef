"""Structured JSON logs with a request ID, and a redaction filter so phones/OTPs/tokens never reach log sinks."""
import contextvars
import json
import logging
import re
import sys
import time
import uuid
from pathlib import Path

from starlette.middleware.base import BaseHTTPMiddleware

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_PATTERNS = [
    # Database URLs in connection errors: keep the scheme and host, drop the user and password.
    (re.compile(r"(postgres(?:ql)?(?:\+\w+)?://)[^@\s/]+@"), r"\1***@"),
    # 10-digit Indian mobile, optionally +91/91/0-prefixed, also written as 5+5 digits with a space or hyphen.
    (re.compile(r"(?<!\d)(?:(?:\+?91|0)[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?!\d)"), "[PHONE]"),
    (re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]+"), "Bearer [TOKEN]"),
    # PostgreSQL constraint errors echo the row / key values in their DETAIL line (names, emails, notes).
    (re.compile(r"Failing row contains \(.*"), "Failing row contains ([REDACTED])"),
    (re.compile(r"(Key \([^)]*\)=)\(.*?\)(?= already exists| is not present| conflicts)"), r"\g<1>([REDACTED])"),
    (re.compile(r"eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+"), "[JWT]"),
    (re.compile(r'(?i)("?(?:otp|code|password|token|refresh_token|refreshToken|secret)"?\s*[:=]\s*"?)[^",\s}]+'), r"\1[REDACTED]"),
]


def redact(text: str) -> str:
    for pat, repl in _PATTERNS:
        text = pat.sub(repl, text)
    return text


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        msg = record.getMessage()
        # The dev OTP log line is the one intentional exception (assignment §3.1: mock provider writes OTP to log).
        if not getattr(record, "allow_secret", False):
            msg = redact(msg)
        out = {"ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"), "level": record.levelname, "logger": record.name,
               "request_id": request_id_var.get(), "msg": msg}
        if record.exc_info:
            out["exc"] = redact(self.formatException(record.exc_info))
        return json.dumps(out, ensure_ascii=False)


def setup_logging(level: str = "INFO", log_file: str | None = None) -> None:
    handlers: list[logging.Handler] = [logging.StreamHandler(sys.stdout)]
    if log_file:
        path = Path(log_file)
        if not path.is_absolute():
            path = Path(__file__).resolve().parents[2] / path  # the backend folder
        handlers.append(logging.FileHandler(path, encoding="utf-8"))
    for h in handlers:
        h.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = handlers
    root.setLevel(level)
    # Uvicorn access logs include query strings; route them through the same redacting formatter.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        lg = logging.getLogger(name)
        lg.handlers[:] = handlers
        lg.propagate = False


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        rid = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id_var.set(rid)
        start = time.perf_counter()
        try:
            response = await call_next(request)
            response.headers["X-Request-ID"] = rid
            logging.getLogger("http").info("%s %s %s %.1fms", request.method, request.url.path, response.status_code,
                                           (time.perf_counter() - start) * 1000)
            return response
        finally:
            request_id_var.reset(token)
