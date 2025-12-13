from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    model_name: str = "da3-base"
    max_upload_size: int = 524288000  # 500MB
    max_frames: int = 16
    frame_interval: int = 30
    process_resolution: int = 504
    temp_dir: Path = Path("/tmp/garaza")
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_prefix = "GARAZA_"

settings = Settings()
