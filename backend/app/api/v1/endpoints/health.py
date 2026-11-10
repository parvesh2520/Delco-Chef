from fastapi import APIRouter
from app.schemas.health import HealthCheck
from app.core.config import settings

router = APIRouter()


@router.get(
    "/health",
    response_model=HealthCheck,
    summary="Health check endpoint",
    description="Returns the current operational status of the Delco Chefs API."
)
def get_health() -> HealthCheck:
    return HealthCheck(
        status="healthy",
        app=settings.PROJECT_NAME,
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
    )
