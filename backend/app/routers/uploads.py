import os
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.core.config import settings
from app.core.deps import CurrentUser

router = APIRouter(prefix="/api/uploads", tags=["uploads"])

ALLOWED_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def _uploads_root() -> Path:
    root = Path(settings.uploads_dir)
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[2] / root
    root.mkdir(parents=True, exist_ok=True)
    return root


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_image(current_user: CurrentUser, file: UploadFile = File(...)):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only JPG, PNG, WEBP or GIF images are allowed.",
        )

    payload = await file.read()
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Image is too large (max 5 MB).",
        )

    name = f"{current_user.id}-{uuid.uuid4().hex[:8]}{suffix}"
    path = _uploads_root() / name
    path.write_bytes(payload)

    return {"success": True, "url": f"/uploads/{name}"}
