from pydantic import BaseModel
from typing import Optional
from datetime import datetime

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


# Room schemas for storing rendered rooms
class RoomCreate(BaseModel):
    """Request body for creating a room from a completed job."""
    job_id: str
    name: str
    description: Optional[str] = None


class RoomUpdate(BaseModel):
    """Request body for updating room metadata."""
    name: Optional[str] = None
    description: Optional[str] = None


class RoomAsset(BaseModel):
    """Asset file information for a room."""
    filename: str
    url: str
    format: str
    lod_level: Optional[str] = None
    file_size_bytes: Optional[int] = None


class RoomResponse(BaseModel):
    """Response model for a stored room."""
    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    job_id: Optional[str] = None
    frame_count: Optional[int] = None
    point_count: Optional[int] = None
    model_used: Optional[str] = None
    original_width: Optional[int] = None
    original_height: Optional[int] = None
    file_size_bytes: float
    file_size_display: str
    thumbnail_url: Optional[str] = None
    assets: Optional[list[RoomAsset]] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class RoomListResponse(BaseModel):
    """Response model for listing rooms with pagination."""
    rooms: list[RoomResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


# YOLO Detection schemas
class BoundingBox(BaseModel):
    """Normalized bounding box coordinates (0-1)."""
    x: float
    y: float
    width: float
    height: float


class PixelBoundingBox(BaseModel):
    """Pixel-space bounding box coordinates."""
    x1: int
    y1: int
    x2: int
    y2: int


class Point2D(BaseModel):
    """2D point with normalized coordinates (0-1)."""
    x: float
    y: float


class FurnitureDetection(BaseModel):
    """A single furniture detection result."""
    class_name: str
    confidence: float
    bbox: BoundingBox
    center: Point2D
    pixel_bbox: PixelBoundingBox


class DetectFurnitureRequest(BaseModel):
    """Request body for furniture detection."""
    image_base64: str  # Base64-encoded image (PNG from canvas)
    confidence_threshold: float = 0.3
    iou_threshold: float = 0.5


class DetectFurnitureResponse(BaseModel):
    """Response containing detected furniture items."""
    detections: list[FurnitureDetection]
    image_width: int
    image_height: int


# Nano Banana Pro - Furniture Replacement schemas
class FurnitureReplacementRequest(BaseModel):
    """Request body for AI furniture replacement using Gemini."""
    room_image_base64: str  # Base64-encoded room image
    furniture_image_base64: str  # Base64-encoded furniture image to place
    furniture_description: str  # Description of the furniture piece
    target_location: Optional[str] = None  # Where to place furniture (e.g., "center of room", "by the window")
    style_hints: Optional[str] = None  # Style guidance (e.g., "modern minimalist", "cozy rustic")
    aspect_ratio: Optional[str] = "16:9"  # Output aspect ratio


class FurnitureReplacementResponse(BaseModel):
    """Response containing the generated image with replaced furniture."""
    generated_image_base64: str  # Base64-encoded generated image
    prompt_used: str  # The prompt sent to the model
    generation_time_seconds: float  # Time taken for generation
    model_used: str  # Model identifier used
    cache_hit: bool = False  # Whether result was from cache


class ImageProxyRequest(BaseModel):
    """Request body for proxying external images (CORS bypass)."""
    url: str  # External image URL to fetch


class ImageProxyResponse(BaseModel):
    """Response containing fetched image as base64."""
    image_base64: str  # Base64-encoded image data
