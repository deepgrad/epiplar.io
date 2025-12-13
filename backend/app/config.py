from pydantic_settings import BaseSettings
from pydantic import BaseModel
from pathlib import Path
from typing import Any


class LODConfig(BaseModel):
    """Configuration for a single LOD level."""
    name: str
    max_points: int
    conf_thresh: float


class Settings(BaseSettings):
    # Use the best model: DA3NESTED-GIANT-LARGE (1.4B params, requires ~16GB VRAM)
    # Alternatives: "da3-large" (less VRAM), "da3-base" (lowest quality)
    model_name: str = "DA3NESTED-GIANT-LARGE"

    max_upload_size: int = 524288000  # 500MB
    max_frames: int = 256  # Maximum frames for best reconstruction

    # Quality settings - MAXIMUM QUALITY (compute not a concern)
    process_resolution: int = 1008  # Highest supported (504, 756, 1008)
    use_ray_pose: bool = True  # Better camera pose accuracy (+44%)
    num_max_points: int = 10_000_000  # 10M points for maximum density
    conf_thresh_percentile: float = 3.0  # Keep 97% of points (almost no filtering)

    # Export settings - GLB point cloud only
    export_format: str = "glb"
    show_cameras: bool = False  # Show camera positions in GLB

    # LOD Configuration - progressive loading for large point clouds
    enable_lod: bool = True  # Feature flag for LOD generation
    lod_configs: list[dict[str, Any]] = [
        {"name": "preview", "max_points": 100_000, "conf_thresh": 20.0},
        {"name": "medium", "max_points": 1_000_000, "conf_thresh": 10.0},
        {"name": "full", "max_points": 10_000_000, "conf_thresh": 3.0},
    ]

    # Draco Compression - reduces GLB file size 5-10x
    enable_draco: bool = True
    draco_compression_level: int = 7  # 1-10, higher = smaller files but slower

    temp_dir: Path = Path("/tmp/garaza")
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_prefix = "GARAZA_"

settings = Settings()
