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
    lod_level: Optional[str] = None  # "preview", "medium", "full", or None for legacy
    point_count: Optional[int] = None  # Number of points in this LOD
    file_size_bytes: Optional[int] = None  # File size for download estimation


class LODAssetCollection(BaseModel):
    """Collection of LOD assets for progressive loading."""
    preview: Optional[ModelAsset] = None  # ~100K points, immediate load
    medium: Optional[ModelAsset] = None   # ~1M points, background load
    full: Optional[ModelAsset] = None     # ~10M points, on-demand load

class ProcessingResult(BaseModel):
    job_id: str
    frames: list[DepthFrame]
    camera_params: Optional[CameraParameters] = None
    model_asset: Optional[ModelAsset] = None  # Keep for backwards compat (returns full quality)
    lod_assets: Optional[LODAssetCollection] = None  # Multi-LOD assets for progressive loading
    original_width: int
    original_height: int
    model_used: str

class JobStatus(BaseModel):
    job_id: str
    status: str  # "pending", "processing", "completed", "failed"
    progress: Optional[ProgressUpdate] = None
    error: Optional[str] = None
