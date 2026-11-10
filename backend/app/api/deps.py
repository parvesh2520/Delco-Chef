from typing import Generator
from sqlalchemy.orm import Session
from app.core.database import get_db

# Re-export database dependency for API endpoints
__all__ = ["get_db"]
