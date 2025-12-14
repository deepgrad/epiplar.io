"""
Room service for managing stored rendered rooms.
Handles CRUD operations and file management for user rooms.
"""
import os
import shutil
import logging
from pathlib import Path
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from ..db.models import Room, User, UserActivity
from ..models.schemas import RoomCreate, RoomUpdate, RoomResponse, RoomAsset
from ..config import settings

logger = logging.getLogger(__name__)

# Directory for storing room files (persistent storage)
ROOMS_STORAGE_DIR = Path(__file__).parent.parent.parent / "data" / "rooms"
ROOMS_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


async def get_room_by_id(db: AsyncSession, room_id: int, user_id: int) -> Optional[Room]:
    """Get a room by ID, ensuring it belongs to the user."""
    result = await db.execute(
        select(Room).where(Room.id == room_id, Room.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def get_user_room_count(db: AsyncSession, user_id: int) -> int:
    """Get the total number of rooms for a user."""
    result = await db.execute(
        select(func.count(Room.id)).where(Room.user_id == user_id)
    )
    return result.scalar() or 0


async def get_rooms_by_user(
    db: AsyncSession,
    user_id: int,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Room], int]:
    """Get all rooms for a user with pagination."""
    # Get total count
    count_result = await db.execute(
        select(func.count(Room.id)).where(Room.user_id == user_id)
    )
    total = count_result.scalar() or 0

    # Get paginated rooms
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Room)
        .where(Room.user_id == user_id)
        .order_by(desc(Room.created_at))
        .offset(offset)
        .limit(page_size)
    )
    rooms = list(result.scalars().all())

    return rooms, total


async def create_room_from_job(
    db: AsyncSession,
    user: User,
    room_data: RoomCreate,
    job_result: dict,
) -> Room:
    """
    Create a new room from a completed processing job.
    Copies assets from temp job directory to persistent storage.
    """
    job_id = room_data.job_id
    job_dir = settings.temp_dir / job_id

    if not job_dir.exists():
        raise ValueError(f"Job directory not found: {job_id}")

    # Create room storage directory
    room_storage = ROOMS_STORAGE_DIR / str(user.id)
    room_storage.mkdir(parents=True, exist_ok=True)

    # Find and copy GLB files
    glb_files = list(job_dir.glob("*.glb"))
    total_size = 0
    glb_file_path = None
    preview_glb_path = None
    medium_glb_path = None
    thumbnail_path = None

    # Copy GLB files to room storage with unique naming
    import uuid
    room_uuid = str(uuid.uuid4())[:8]
    room_subdir = room_storage / f"{room_uuid}_{job_id}"
    room_subdir.mkdir(parents=True, exist_ok=True)

    for glb_file in glb_files:
        dest_path = room_subdir / glb_file.name
        shutil.copy2(glb_file, dest_path)
        file_size = dest_path.stat().st_size
        total_size += file_size

        # Categorize by LOD level based on filename
        if "preview" in glb_file.name.lower():
            preview_glb_path = str(dest_path)
        elif "medium" in glb_file.name.lower():
            medium_glb_path = str(dest_path)
        else:
            # Main/full quality GLB
            if glb_file_path is None:
                glb_file_path = str(dest_path)

    # Look for thumbnail (first frame as JPG/PNG)
    for ext in ["jpg", "jpeg", "png"]:
        thumb_files = list(job_dir.glob(f"*.{ext}"))
        if thumb_files:
            dest_thumb = room_subdir / thumb_files[0].name
            shutil.copy2(thumb_files[0], dest_thumb)
            thumbnail_path = str(dest_thumb)
            total_size += dest_thumb.stat().st_size
            break

    # Extract metadata from job result
    frame_count = len(job_result.get("frames", []))
    point_count = None
    model_used = job_result.get("model_used")
    original_width = job_result.get("original_width")
    original_height = job_result.get("original_height")

    # Try to get point count from LOD assets
    lod_assets = job_result.get("lod_assets")
    if lod_assets:
        full_asset = lod_assets.get("full")
        if full_asset:
            point_count = full_asset.get("point_count")

    # Create room record
    room = Room(
        user_id=user.id,
        name=room_data.name,
        description=room_data.description,
        job_id=job_id,
        frame_count=frame_count,
        point_count=point_count,
        model_used=model_used,
        original_width=original_width,
        original_height=original_height,
        glb_file_path=glb_file_path,
        preview_glb_path=preview_glb_path,
        medium_glb_path=medium_glb_path,
        thumbnail_path=thumbnail_path,
        file_size_bytes=total_size,
    )

    db.add(room)

    # Update user storage (scan counts are updated during processing, not saving)
    user.storage_used_bytes = (user.storage_used_bytes or 0) + total_size

    # Log activity
    activity = UserActivity(
        user_id=user.id,
        action="room_saved",
        description=f"Saved room: {room_data.name}",
        metadata_json=f'{{"room_name": "{room_data.name}", "job_id": "{job_id}", "file_size": {total_size}}}'
    )
    db.add(activity)

    await db.commit()
    await db.refresh(room)

    logger.info(f"Room created: {room.id} for user {user.id}, size: {total_size} bytes")
    return room


async def update_room(
    db: AsyncSession,
    room: Room,
    room_data: RoomUpdate,
) -> Room:
    """Update room metadata."""
    if room_data.name is not None:
        room.name = room_data.name
    if room_data.description is not None:
        room.description = room_data.description

    await db.commit()
    await db.refresh(room)
    return room


async def delete_room(
    db: AsyncSession,
    room: Room,
    user: User,
) -> bool:
    """Delete a room and its associated files."""
    # Get file size before deletion for storage tracking
    file_size = room.file_size_bytes or 0

    # Delete files from storage
    files_to_delete = [
        room.glb_file_path,
        room.preview_glb_path,
        room.medium_glb_path,
        room.thumbnail_path,
    ]

    for file_path in files_to_delete:
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.debug(f"Deleted file: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to delete file {file_path}: {e}")

    # Try to remove the room directory if empty
    if room.glb_file_path:
        room_dir = Path(room.glb_file_path).parent
        try:
            if room_dir.exists() and not any(room_dir.iterdir()):
                room_dir.rmdir()
                logger.debug(f"Removed empty room directory: {room_dir}")
        except Exception as e:
            logger.warning(f"Failed to remove room directory: {e}")

    # Update user storage
    user.storage_used_bytes = max(0, (user.storage_used_bytes or 0) - file_size)

    # Log activity
    activity = UserActivity(
        user_id=user.id,
        action="room_deleted",
        description=f"Deleted room: {room.name}",
        metadata_json=f'{{"room_name": "{room.name}", "room_id": {room.id}, "freed_bytes": {file_size}}}'
    )
    db.add(activity)

    # Delete room record
    await db.delete(room)
    await db.commit()

    logger.info(f"Room deleted: {room.id}, freed {file_size} bytes")
    return True


def build_room_response(room: Room) -> RoomResponse:
    """Build a RoomResponse from a Room model."""
    assets = []

    # Build asset list
    if room.glb_file_path:
        assets.append(RoomAsset(
            filename=Path(room.glb_file_path).name,
            url=f"/api/rooms/{room.id}/assets/{Path(room.glb_file_path).name}",
            format="glb",
            lod_level="full",
            file_size_bytes=int(Path(room.glb_file_path).stat().st_size) if os.path.exists(room.glb_file_path) else None,
        ))

    if room.preview_glb_path:
        assets.append(RoomAsset(
            filename=Path(room.preview_glb_path).name,
            url=f"/api/rooms/{room.id}/assets/{Path(room.preview_glb_path).name}",
            format="glb",
            lod_level="preview",
            file_size_bytes=int(Path(room.preview_glb_path).stat().st_size) if os.path.exists(room.preview_glb_path) else None,
        ))

    if room.medium_glb_path:
        assets.append(RoomAsset(
            filename=Path(room.medium_glb_path).name,
            url=f"/api/rooms/{room.id}/assets/{Path(room.medium_glb_path).name}",
            format="glb",
            lod_level="medium",
            file_size_bytes=int(Path(room.medium_glb_path).stat().st_size) if os.path.exists(room.medium_glb_path) else None,
        ))

    thumbnail_url = None
    if room.thumbnail_path and os.path.exists(room.thumbnail_path):
        thumbnail_url = f"/api/rooms/{room.id}/thumbnail"

    return RoomResponse(
        id=room.id,
        user_id=room.user_id,
        name=room.name,
        description=room.description,
        job_id=room.job_id,
        frame_count=room.frame_count,
        point_count=room.point_count,
        model_used=room.model_used,
        original_width=room.original_width,
        original_height=room.original_height,
        file_size_bytes=room.file_size_bytes or 0,
        file_size_display=room.file_size_display,
        thumbnail_url=thumbnail_url,
        assets=assets if assets else None,
        created_at=room.created_at,
        updated_at=room.updated_at,
    )
