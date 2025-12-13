from pydantic_settings import BaseSettings
from pathlib import Path
import secrets

class Settings(BaseSettings):
    # Use the best model: DA3NESTED-GIANT-LARGE-1.1 (1.4B params, requires ~16GB VRAM)
    # Alternatives: "da3-large-1.1" (less VRAM), "da3-base" (lowest quality)
    model_name: str = "da3nested-giant-large-1.1"

    max_upload_size: int = 524288000  # 500MB
    max_frames: int = 32  # More frames = better reconstruction
    frame_interval: int = 15  # Extract more frequently for smoother coverage

    # Quality settings
    process_resolution: int = 756  # Higher = more detail (504, 756, 1008)
    use_ray_pose: bool = True  # Better camera pose accuracy (+44%)
    enable_gaussian_splatting: bool = True  # Enable 3DGS for best quality
    num_max_points: int = 1_000_000  # Maximum points in output
    conf_thresh_percentile: float = 30.0  # Lower = more points (less filtering)

    # Export settings
    # gs_ply = Gaussian Splatting PLY (best quality, requires gsplat)
    # glb = Point cloud GLB (fallback)
    # Combined format exports multiple outputs
    export_format: str = "gs_ply-glb"
    show_cameras: bool = False  # Show camera positions in GLB

    temp_dir: Path = Path("/tmp/garaza")
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    # JWT Authentication settings
    secret_key: str = secrets.token_urlsafe(32)
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    class Config:
        env_prefix = "GARAZA_"

settings = Settings()
