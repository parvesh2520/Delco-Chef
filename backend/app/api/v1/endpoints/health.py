from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.database import check_database

router = APIRouter(tags=["Health"])


def health_payload() -> JSONResponse:
    ok, revision = check_database()
    body = {"status": "healthy" if ok else "unhealthy", "database": "ok" if ok else "unreachable", "migration": revision,
            "app": settings.PROJECT_NAME, "version": settings.VERSION, "environment": settings.ENVIRONMENT}
    return JSONResponse(body, status_code=200 if ok else 503)


def version_payload() -> dict:
    return {"version": settings.VERSION, "commit": settings.GIT_COMMIT, "environment": settings.ENVIRONMENT}


@router.get("/health", summary="Checks PostgreSQL connectivity and the applied migration")
def health():
    return health_payload()


@router.get("/version", summary="Deployed version and commit")
def version():
    return version_payload()
