"""Single error type for business failures. Every refusal carries a specific, stable code."""
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(self, code: str, message: str, status: int = 400, *, retry_after: int | None = None,
                 fields: dict[str, str] | None = None, extra: dict | None = None):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status
        self.retry_after, self.fields, self.extra = retry_after, fields, extra or {}


def not_found(what: str = "Resource") -> AppError:
    return AppError("NOT_FOUND", f"{what} not found.", 404)


def forbidden(message: str = "You are not allowed to do this.") -> AppError:
    return AppError("FORBIDDEN", message, 403)


def _body(code: str, message: str, **extra) -> dict:
    return {"error": {"code": code, "message": message, **{k: v for k, v in extra.items() if v is not None}}}


async def app_error_handler(_: Request, exc: AppError) -> JSONResponse:
    headers = {"Retry-After": str(exc.retry_after)} if exc.retry_after else None
    return JSONResponse(_body(exc.code, exc.message, retryAfter=exc.retry_after, fields=exc.fields, **exc.extra),
                        status_code=exc.status, headers=headers)


async def validation_error_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    fields: dict[str, str] = {}
    for e in exc.errors():
        loc = [str(p) for p in e["loc"] if p not in ("body", "query", "path")]
        msg = e["msg"].removeprefix("Value error, ")
        fields[".".join(loc) or "request"] = msg
    first = next(iter(fields.items()), ("request", "Invalid request"))
    return JSONResponse(_body("VALIDATION_ERROR", f"{first[0]}: {first[1]}", fields=fields), status_code=422)
