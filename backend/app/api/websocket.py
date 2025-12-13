from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import asyncio
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

# Import jobs from routes (shared state)
from .routes import jobs

@router.websocket("/ws/{job_id}")
async def websocket_progress(websocket: WebSocket, job_id: str):
    """WebSocket endpoint for real-time progress updates."""
    await websocket.accept()
    logger.info(f"WebSocket connected: {job_id}")

    last_progress = None

    try:
        while True:
            if job_id not in jobs:
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": "Job not found"}
                })
                break

            job = jobs[job_id]

            # Send progress updates
            current_progress = job.get("progress")
            if current_progress != last_progress:
                await websocket.send_json({
                    "type": "progress",
                    "data": current_progress
                })
                last_progress = current_progress

            # Check if completed or failed
            if job["status"] == "completed":
                await websocket.send_json({
                    "type": "complete",
                    "data": job["result"]
                })
                break
            elif job["status"] == "failed":
                await websocket.send_json({
                    "type": "error",
                    "data": {"message": job.get("error", "Processing failed")}
                })
                break

            # Wait before checking again
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: {job_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "data": {"message": str(e)}
            })
        except:
            pass
