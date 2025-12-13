import uuid
import aiofiles
from pathlib import Path
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
    import shutil
    job_dir = settings.temp_dir / job_id
    if job_dir.exists():
        shutil.rmtree(job_dir)
