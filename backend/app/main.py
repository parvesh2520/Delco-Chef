import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1.api import api_router
from app.api.v1.endpoints.health import health_payload, version_payload
from app.core.config import settings
from app.core.errors import AppError, app_error_handler, validation_error_handler
from app.core.logging import RequestContextMiddleware, setup_logging

setup_logging("DEBUG" if settings.DEBUG else "INFO", None if settings.ENVIRONMENT == "test" else settings.LOG_FILE)
settings.validate_production()
log = logging.getLogger("app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    from app.services import worker
    if settings.RUN_WORKERS:
        worker.start()
    from app.services.gateway import get_gateway
    log.info("Started %s %s (%s), payment gateway: %s, file storage: %s", settings.PROJECT_NAME, settings.VERSION,
             settings.ENVIRONMENT, get_gateway().name, "s3" if settings.S3_BUCKET else "local disk")
    if settings.is_production and not settings.S3_BUCKET:
        log.warning("Photos and documents are on the local disk, which this host may wipe on redeploy. Set S3_BUCKET.")
    yield
    worker.stop()
    from app.core.database import SessionLocal
    from app.services import tracking
    db = SessionLocal()
    try:
        tracking.flush(db)  # don't lose buffered location points on shutdown
    finally:
        db.close()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Delco Chefs API. All business rules are enforced here; the mobile app only displays and submits.",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)
app.add_middleware(RequestContextMiddleware)
if settings.BACKEND_CORS_ORIGINS:
    app.add_middleware(CORSMiddleware, allow_origins=settings.BACKEND_CORS_ORIGINS, allow_credentials=False,
                       allow_methods=["*"], allow_headers=["*"])
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)


@app.exception_handler(Exception)
async def unhandled(_: Request, exc: Exception):
    log.exception("Unhandled error")
    return JSONResponse({"error": {"code": "INTERNAL_ERROR", "message": "Something went wrong. Please try again."}}, status_code=500)


@app.get("/health", tags=["Health"])
def root_health():
    return health_payload()


@app.get("/version", tags=["Health"])
def root_version():
    return version_payload()


app.include_router(api_router, prefix=settings.API_V1_STR)
