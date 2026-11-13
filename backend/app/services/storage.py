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
        try:
            return self._path(key).read_bytes()
        except FileNotFoundError:  # e.g. a Render redeploy wiped the local disk
            raise AppError("FILE_NOT_FOUND", "This file is no longer available.", 404) from None

    def delete(self, key: str) -> None:
        try:
            os.remove(self._path(key))
        except FileNotFoundError:
            pass


class S3Storage:
    """Any S3-compatible bucket (Cloudflare R2, AWS S3, Backblaze B2, MinIO…). The bucket stays PRIVATE: nothing is
    ever served from it directly. The API reads the bytes after its own permission check (chef, owning customer or
    Admin), so no URL to a photo works without a valid login."""

    def __init__(self, bucket: str, client):
        self.bucket, self.client = bucket, client

    @classmethod
    def from_settings(cls) -> "S3Storage":
        import boto3
        from botocore.config import Config
        client = boto3.client("s3", endpoint_url=settings.S3_ENDPOINT_URL or None, region_name=settings.S3_REGION,
                              aws_access_key_id=settings.S3_ACCESS_KEY_ID, aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
                              config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"},
                                            connect_timeout=5, read_timeout=15))
        return cls(settings.S3_BUCKET, client)

    def put(self, prefix: str, data: bytes, ext: str) -> str:
        key = f"{prefix}/{uuid.uuid4().hex}.{ext}"
        ctype = {"png": "image/png", "jpg": "image/jpeg", "json": "application/json"}.get(ext, "application/octet-stream")
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=ctype)
        return key

    def get(self, key: str) -> bytes:
        try:
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()
        except self.client.exceptions.NoSuchKey:
            raise AppError("FILE_NOT_FOUND", "This file is no longer available.", 404) from None

    def delete(self, key: str) -> None:
        self.client.delete_object(Bucket=self.bucket, Key=key)  # S3 deletes are idempotent


def build_storage():
    """S3-compatible storage when a bucket is configured; otherwise local disk (development, Docker). Render's local
    disk is wiped on every deploy, so production should set the S3_* variables."""
    if settings.S3_BUCKET:
        return S3Storage.from_settings()
    return LocalStorage(settings.MEDIA_ROOT)


storage = build_storage()


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
