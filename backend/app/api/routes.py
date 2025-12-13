from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import FileResponse
from pathlib import Path
import asyncio
import logging
from typing import Optional

from ..models.schemas import ProcessVideoRequest, ProcessingResult, JobStatus, ProgressUpdate
from ..services.depth_service import depth_service
from ..services.video_service import video_service
from ..utils.file_utils import save_upload_file, cleanup_job, get_disk_usage, get_job_directories, cleanup_old_jobs
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter()

# In-memory job storage (use Redis in production)
jobs: dict[str, dict] = {}

@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a video file for processing."""
    # Validate file type
    content_type = file.content_type or ""
    if not content_type.startswith("video/"):
        raise HTTPException(400, "File must be a video")

    # Check file size (read content length if available)
    if file.size and file.size > settings.max_upload_size:
        raise HTTPException(413, f"File too large. Max size: {settings.max_upload_size // 1024 // 1024}MB")

    # Save file
    job_id, file_path = await save_upload_file(file)

    # Initialize job
    jobs[job_id] = {
        "status": "uploaded",
        "file_path": str(file_path),
        "progress": None,
        "result": None,
        "error": None,
    }

    logger.info(f"Video uploaded: {job_id}")
    return {"job_id": job_id, "status": "uploaded"}

@router.post("/process/{job_id}")
async def start_processing(
    job_id: str,
    request: ProcessVideoRequest = ProcessVideoRequest(),
    background_tasks: BackgroundTasks = None,
):
    """Start processing a previously uploaded video."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job = jobs[job_id]
    if job["status"] not in ["uploaded", "failed"]:
        raise HTTPException(400, f"Job already {job['status']}")

    job["status"] = "processing"

    # Run processing in background
    background_tasks.add_task(
        process_video_task,
        job_id,
        Path(job["file_path"]),
        request.max_frames,
    )

    return {"status": "processing", "job_id": job_id}

async def process_video_task(
    job_id: str,
    video_path: Path,
    max_frames: int,
):
    """Background task to process video."""
    try:
        def update_progress(progress: ProgressUpdate):
            jobs[job_id]["progress"] = progress.model_dump()

        # Extract frames
        update_progress(ProgressUpdate(
            stage="Extracting frames",
            progress=5.0,
            message="Extracting video frames..."
        ))

        frames = video_service.extract_frames_to_list(
            video_path,
            max_frames=max_frames,
        )

        if not frames:
            raise ValueError("No frames extracted from video")

        # Run depth estimation
        result = await depth_service.estimate_depth(
            frames,
            job_id,
            progress_callback=update_progress,
        )

        jobs[job_id]["status"] = "completed"
        jobs[job_id]["result"] = result.model_dump()

        logger.info(f"Job completed: {job_id}")
        
        # Auto-cleanup if enabled
        if settings.auto_cleanup_after_completion:
            logger.info(f"Auto-cleaning up job {job_id} after completion")
            cleanup_job(job_id)

    except Exception as e:
        logger.error(f"Job failed: {job_id} - {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)

@router.get("/status/{job_id}")
async def get_status(job_id: str) -> JobStatus:
    """Get the status of a processing job."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job = jobs[job_id]
    return JobStatus(
        job_id=job_id,
        status=job["status"],
        progress=ProgressUpdate(**job["progress"]) if job["progress"] else None,
        error=job["error"],
    )

@router.get("/result/{job_id}")
async def get_result(job_id: str) -> ProcessingResult:
    """Get the processing result."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(400, f"Job not completed. Status: {job['status']}")

    return ProcessingResult(**job["result"])

@router.get("/assets/{job_id}/{file_path:path}")
async def get_job_asset(job_id: str, file_path: str):
    """Download or stream a generated job asset (e.g., scene.glb)."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job_dir = (settings.temp_dir / job_id).resolve()
    asset_path = (job_dir / file_path).resolve()

    # Prevent path traversal
    if not str(asset_path).startswith(str(job_dir)):
        raise HTTPException(400, "Invalid asset path")

    if not asset_path.exists() or not asset_path.is_file():
        raise HTTPException(404, f"Asset not found: {file_path}")

    # Best-effort media type
    suffix = asset_path.suffix.lower()
    media_type = {
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".ply": "application/octet-stream",
        ".obj": "text/plain",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".mp4": "video/mp4",
    }.get(suffix, "application/octet-stream")

    # Return with CORS headers for cross-origin embedding
    return FileResponse(
        str(asset_path),
        media_type=media_type,
        filename=asset_path.name,
        headers={
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Access-Control-Allow-Origin": "*",
        },
    )

@router.delete("/job/{job_id}")
async def cancel_job(job_id: str):
    """Cancel and cleanup a job."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    # Cleanup files
    cleanup_job(job_id)

    # Remove from memory
    del jobs[job_id]

    return {"status": "deleted"}

@router.get("/admin/disk-usage")
async def get_disk_usage_info():
    """Get disk usage information for the temp directory."""
    disk_info = get_disk_usage(settings.temp_dir)
    job_dirs = get_job_directories()
    
    total_job_size = sum(j["size_bytes"] for j in job_dirs)
    
    return {
        "disk": disk_info,
        "temp_dir": str(settings.temp_dir),
        "job_count": len(job_dirs),
        "total_job_size_gb": round(total_job_size / (1024**3), 4),
    }

@router.get("/admin/jobs")
async def list_jobs_on_disk(
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Number of jobs per page"),
):
    """List all job directories on disk with their sizes (paginated)."""
    # Get job directories only once
    all_jobs = get_job_directories()
    total_count = len(all_jobs)

    # Calculate pagination indices
    start = (page - 1) * page_size
    end = start + page_size

    # Calculate total pages (ceiling division)
    total_pages = (total_count + page_size - 1) // page_size if total_count > 0 else 1

    return {
        "jobs": all_jobs[start:end],
        "count": total_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }

@router.post("/admin/cleanup")
async def cleanup_jobs(
    max_age_hours: Optional[float] = Query(None, description="Only delete jobs older than this (hours). If not provided, deletes all jobs."),
    dry_run: bool = Query(False, description="If true, only show what would be deleted without actually deleting."),
):
    """
    Clean up old job directories to free disk space.
    
    WARNING: This will permanently delete job files!
    """
    result = cleanup_old_jobs(max_age_hours=max_age_hours, dry_run=dry_run)
    
    # Get updated disk usage
    disk_info = get_disk_usage(settings.temp_dir)
    
    return {
        **result,
        "disk_usage_after": disk_info,
    }
