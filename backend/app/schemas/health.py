from datetime import datetime
from pydantic import BaseModel, Field


class HealthCheck(BaseModel):
    status: str = Field(default="healthy", description="Service health status")
    app: str = Field(default="Delco Chefs API", description="Application name")
    version: str = Field(default="1.0.0", description="Application version")
    timestamp: datetime = Field(default_factory=datetime.utcnow, description="Health check timestamp")
    environment: str = Field(default="development", description="Current environment")
