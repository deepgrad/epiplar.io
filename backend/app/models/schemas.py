from pydantic import BaseModel
from typing import Optional

class ProcessVideoRequest(BaseModel):
    max_frames: int = 128

class ProgressUpdate(BaseModel):
    stage: str
    progress: float
    current_frame: Optional[int] = None
    total_frames: Optional[int] = None
    message: str

class DepthFrame(BaseModel):
    frame_index: int
    depth_map_b64: str  # Base64 encoded Float32Array
    width: int
    height: int
    confidence_b64: Optional[str] = None

class CameraParameters(BaseModel):
    extrinsics: list[list[list[float]]]  # [N, 3, 4]
    intrinsics: list[list[list[float]]]  # [N, 3, 3]

class ModelAsset(BaseModel):
    """A generated 3D asset (mesh/point cloud) stored for a job."""
    filename: str
    url: str  # relative URL (frontend should prefix with API base URL)
    format: str  # e.g. "glb", "ply"

class ProcessingResult(BaseModel):
    job_id: str
    frames: list[DepthFrame]
    camera_params: Optional[CameraParameters] = None
    model_asset: Optional[ModelAsset] = None
    original_width: int
    original_height: int
    model_used: str

class JobStatus(BaseModel):
    job_id: str
    status: str  # "pending", "processing", "completed", "failed"
    progress: Optional[ProgressUpdate] = None
    error: Optional[str] = None
