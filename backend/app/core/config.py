from typing import List, Union
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Delco Chefs API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Server Host & Port
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # PostgreSQL Database
    DATABASE_URL: str = "postgresql://delco_user:delco_password@localhost:5432/delco_chefs_db"

    # CORS Origins
    BACKEND_CORS_ORIGINS: List[str] = ["*"]

    # Security
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore"
    )


settings = Settings()
