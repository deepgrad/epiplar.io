"""
Room API routes for managing stored rendered rooms.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path
import logging

from ..db.database import get_db
from ..db.models import User
from ..services.auth_service import get_current_user
from ..services.room_service import (
    get_room_by_id,
    get_rooms_by_user,
    create_room_from_job,
    update_room,
    delete_room,
    build_room_response,
    get_user_room_count,
)
from ..models.schemas import (
    RoomCreate,
    RoomUpdate,
    RoomResponse,
    RoomListResponse,
)
from .routes import jobs  # Access the in-memory job storage

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/rooms", tags=["rooms"])


@router.get("", response_model=RoomListResponse)
async def list_rooms(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all rooms for the current user."""
    rooms, total = await get_rooms_by_user(db, current_user.id, page, page_size)

    total_pages = (total + page_size - 1) // page_size if total > 0 else 1

    return RoomListResponse(
        rooms=[build_room_response(room) for room in rooms],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a specific room by ID."""
    room = await get_room_by_id(db, room_id, current_user.id)
    if not room:
        raise HTTPException(404, "Room not found")

    return build_room_response(room)


@router.post("", response_model=RoomResponse, status_code=201)
async def create_room(
    room_data: RoomCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new room from a completed processing job.

    The job must be in 'completed' status and belong to the current session.
    """
    job_id = room_data.job_id

    # Check if job exists and is completed
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(400, f"Job is not completed. Status: {job['status']}")

    if not job.get("result"):
        raise HTTPException(400, "Job has no result data")

    # Check user's storage limits
    plan_limits = current_user.plan_limits
    max_storage_bytes = plan_limits["max_storage_gb"] * 1024 * 1024 * 1024
    if current_user.storage_used_bytes >= max_storage_bytes:
        raise HTTPException(
            403,
            f"Storage limit reached ({current_user.storage_used_display}). "
            f"Upgrade your plan or delete some rooms."
        )

    # Check saved rooms limit
    max_saved_rooms = plan_limits["max_saved_rooms"]
    if max_saved_rooms != -1:  # -1 = unlimited
        current_room_count = await get_user_room_count(db, current_user.id)
        if current_room_count >= max_saved_rooms:
            raise HTTPException(
                403,
                f"Saved rooms limit reached ({max_saved_rooms} rooms). "
                f"Delete some rooms or upgrade your plan."
            )

    try:
        room = await create_room_from_job(
            db,
            current_user,
            room_data,
            job["result"],
        )
        return build_room_response(room)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error(f"Failed to create room: {e}")
        raise HTTPException(500, "Failed to save room")


@router.put("/{room_id}", response_model=RoomResponse)
async def update_room_endpoint(
    room_id: int,
    room_data: RoomUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update room metadata (name, description)."""
    room = await get_room_by_id(db, room_id, current_user.id)
    if not room:
        raise HTTPException(404, "Room not found")

    room = await update_room(db, room, room_data)
    return build_room_response(room)


@router.delete("/{room_id}")
async def delete_room_endpoint(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a room and its associated files."""
    room = await get_room_by_id(db, room_id, current_user.id)
    if not room:
        raise HTTPException(404, "Room not found")

    await delete_room(db, room, current_user)
    return {"status": "deleted", "room_id": room_id}


@router.get("/{room_id}/assets/{filename}")
async def get_room_asset(
    room_id: int,
    filename: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Download a room asset file (GLB, etc.)."""
    room = await get_room_by_id(db, room_id, current_user.id)
    if not room:
        raise HTTPException(404, "Room not found")

    # Find the asset file
    asset_path = None
    for path in [room.glb_file_path, room.preview_glb_path, room.medium_glb_path]:
        if path and Path(path).name == filename:
            asset_path = Path(path)
            break

    if not asset_path or not asset_path.exists():
        raise HTTPException(404, "Asset not found")

    # Determine media type
    suffix = asset_path.suffix.lower()
    media_type = {
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".ply": "application/octet-stream",
    }.get(suffix, "application/octet-stream")

    return FileResponse(
        str(asset_path),
        media_type=media_type,
        filename=asset_path.name,
        headers={
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Allow-Origin": "*",
        },
    )


@router.get("/{room_id}/thumbnail")
async def get_room_thumbnail(
    room_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get the room thumbnail image."""
    room = await get_room_by_id(db, room_id, current_user.id)
    if not room:
        raise HTTPException(404, "Room not found")

    if not room.thumbnail_path:
        raise HTTPException(404, "No thumbnail available")

    thumb_path = Path(room.thumbnail_path)
    if not thumb_path.exists():
        raise HTTPException(404, "Thumbnail file not found")

    # Determine media type
    suffix = thumb_path.suffix.lower()
    media_type = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
    }.get(suffix, "image/jpeg")

    return FileResponse(
        str(thumb_path),
        media_type=media_type,
    )
