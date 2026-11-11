"""Object storage for photos/documents/exports. Bytes never go into PostgreSQL.
LocalStorage is used in development and Docker; an S3-compatible adapter (R2/Supabase Storage free tier) can
implement the same three methods for production."""
import hashlib
import os
import uuid
from pathlib import Path

from app.core.config import settings
from app.core.errors import AppError

ALLOWED_IMAGE = {"image/jpeg": b"\xff\xd8\xff", "image/png": b"\x89PNG\r\n\x1a\n"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024


class LocalStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise ValueError("invalid storage key")
        return p

    def put(self, prefix: str, data: bytes, ext: str) -> str:
        key = f"{prefix}/{uuid.uuid4().hex}.{ext}"
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return key

    def get(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def delete(self, key: str) -> None:
        try:
            os.remove(self._path(key))
        except FileNotFoundError:
            pass


storage = LocalStorage(settings.MEDIA_ROOT)


def validate_image(data: bytes, content_type: str | None) -> tuple[str, str]:
    """D3: JPEG or PNG up to 5 MB, checked by magic bytes (not just the declared type). Returns (type, sha256)."""
    if not data:
        raise AppError("PHOTO_REQUIRED", "A photo is required.", 422)
    if len(data) > MAX_IMAGE_BYTES:
        raise AppError("PHOTO_TOO_LARGE", "Photo must be 5 MB or smaller.", 413)
    detected = next((t for t, magic in ALLOWED_IMAGE.items() if data.startswith(magic)), None)
    if not detected:
        raise AppError("PHOTO_INVALID_TYPE", "Only JPEG or PNG photos are accepted.", 415)
    return detected, hashlib.sha256(data).hexdigest()
