import uuid
import aiofiles
import shutil
import os
from pathlib import Path
from datetime import datetime, timedelta
from typing import Optional
from fastapi import UploadFile

from ..config import settings

async def save_upload_file(upload_file: UploadFile) -> tuple[str, Path]:
    """
    Save uploaded file and return job_id and path.

    Returns:
        Tuple of (job_id, file_path)
    """
    job_id = str(uuid.uuid4())

    # Create job directory
    job_dir = settings.temp_dir / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    # Determine file extension
    ext = Path(upload_file.filename or "video.mp4").suffix or ".mp4"
    file_path = job_dir / f"input{ext}"

    # Save file
    async with aiofiles.open(file_path, 'wb') as f:
        content = await upload_file.read()
        await f.write(content)

    return job_id, file_path

def cleanup_job(job_id: str):
    """Clean up job files."""
    job_dir = settings.temp_dir / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)

def get_disk_usage(path: Path) -> dict:
    """Get disk usage statistics for a path."""
    try:
        stat = os.statvfs(path)
        total_bytes = stat.f_blocks * stat.f_frsize
        free_bytes = stat.f_bavail * stat.f_frsize
        used_bytes = total_bytes - free_bytes
        
        return {
            "total_gb": round(total_bytes / (1024**3), 2),
            "used_gb": round(used_bytes / (1024**3), 2),
            "free_gb": round(free_bytes / (1024**3), 2),
            "used_percent": round((used_bytes / total_bytes) * 100, 2) if total_bytes > 0 else 0,
        }
    except (OSError, AttributeError):
        # Fallback for Windows or if statvfs not available
        try:
            import shutil
            total, used, free = shutil.disk_usage(path)
            return {
                "total_gb": round(total / (1024**3), 2),
                "used_gb": round(used / (1024**3), 2),
                "free_gb": round(free / (1024**3), 2),
                "used_percent": round((used / total) * 100, 2) if total > 0 else 0,
            }
        except Exception:
            return {
                "total_gb": 0,
                "used_gb": 0,
                "free_gb": 0,
                "used_percent": 0,
            }

def get_job_directories() -> list[dict]:
    """Get list of all job directories with their sizes and modification times."""
    if not settings.temp_dir.exists():
        return []
    
    jobs = []
    for item in settings.temp_dir.iterdir():
        if item.is_dir():
            try:
                # Calculate directory size
                total_size = sum(
                    f.stat().st_size for f in item.rglob('*') if f.is_file()
                )
                
                # Get modification time
                mtime = datetime.fromtimestamp(item.stat().st_mtime)
                
                jobs.append({
                    "job_id": item.name,
                    "size_bytes": total_size,
                    "size_gb": round(total_size / (1024**3), 4),
                    "modified": mtime.isoformat(),
                    "age_hours": (datetime.now() - mtime).total_seconds() / 3600,
                })
            except Exception as e:
                # Skip directories we can't read
                continue
    
    return sorted(jobs, key=lambda x: x["modified"], reverse=True)

def cleanup_old_jobs(max_age_hours: Optional[float] = None, dry_run: bool = False) -> dict:
    """
    Clean up old job directories.
    
    Args:
        max_age_hours: If provided, only delete jobs older than this (in hours).
                       If None, delete all jobs.
        dry_run: If True, don't actually delete, just return what would be deleted.
    
    Returns:
        Dictionary with cleanup statistics.
    """
    jobs = get_job_directories()
    now = datetime.now()
    
    to_delete = []
    total_size = 0
    
    for job in jobs:
        should_delete = False
        if max_age_hours is None:
            should_delete = True
        else:
            if job["age_hours"] > max_age_hours:
                should_delete = True
        
        if should_delete:
            to_delete.append(job)
            total_size += job["size_bytes"]
    
    if not dry_run:
        deleted_count = 0
        deleted_size = 0
        errors = []
        
        for job in to_delete:
            try:
                cleanup_job(job["job_id"])
                deleted_count += 1
                deleted_size += job["size_bytes"]
            except Exception as e:
                errors.append({"job_id": job["job_id"], "error": str(e)})
        
        return {
            "deleted_count": deleted_count,
            "deleted_size_gb": round(deleted_size / (1024**3), 4),
            "errors": errors,
        }
    else:
        return {
            "would_delete_count": len(to_delete),
            "would_delete_size_gb": round(total_size / (1024**3), 4),
        }
