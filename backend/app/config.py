from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    # Use the best model: DA3NESTED-GIANT-LARGE (1.4B params, requires ~16GB VRAM)
    # Alternatives: "da3-large" (less VRAM), "da3-base" (lowest quality)
    model_name: str = "DA3NESTED-GIANT-LARGE"

    max_upload_size: int = 524288000  # 500MB
    max_frames: int = 128  # More frames = better reconstruction (adaptive interval)

    # Quality settings
    process_resolution: int = 756  # Higher = more detail (504, 756, 1008)
    use_ray_pose: bool = True  # Better camera pose accuracy (+44%)
    num_max_points: int = 1_000_000  # Maximum points in output
    conf_thresh_percentile: float = 30.0  # Lower = more points (less filtering)

    # Export settings - GLB point cloud only
    export_format: str = "glb"
    show_cameras: bool = False  # Show camera positions in GLB

    temp_dir: Path = Path("/tmp/garaza")
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_prefix = "GARAZA_"

settings = Settings()
