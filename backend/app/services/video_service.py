import cv2
import numpy as np
from pathlib import Path
from typing import Generator
import logging

logger = logging.getLogger(__name__)

class VideoService:
    """Service for video frame extraction using OpenCV."""

    def get_video_metadata(self, video_path: Path) -> dict:
        """Get video metadata."""
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Failed to open video: {video_path}")

        metadata = {
            "width": int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)),
            "height": int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)),
            "fps": cap.get(cv2.CAP_PROP_FPS),
            "frame_count": int(cap.get(cv2.CAP_PROP_FRAME_COUNT)),
            "duration": cap.get(cv2.CAP_PROP_FRAME_COUNT) / cap.get(cv2.CAP_PROP_FPS),
        }
        cap.release()
        return metadata

    def extract_frames(
        self,
        video_path: Path,
        max_frames: int = 16,
        frame_interval: int = 30,
    ) -> Generator[tuple[int, np.ndarray], None, None]:
        """
        Extract frames from video.

        Args:
            video_path: Path to video file
            max_frames: Maximum number of frames to extract
            frame_interval: Extract every Nth frame

        Yields:
            Tuple of (frame_index, frame_rgb)
        """
        cap = cv2.VideoCapture(str(video_path))
        if not cap.isOpened():
            raise ValueError(f"Failed to open video: {video_path}")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        frames_to_extract = min(max_frames, total_frames // frame_interval + 1)

        logger.info(f"Extracting {frames_to_extract} frames from {total_frames} total")

        frame_count = 0
        extracted = 0

        while cap.isOpened() and extracted < frames_to_extract:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_count % frame_interval == 0:
                # Convert BGR to RGB
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                yield extracted, frame_rgb
                extracted += 1

            frame_count += 1

        cap.release()
        logger.info(f"Extracted {extracted} frames")

    def extract_frames_to_list(
        self,
        video_path: Path,
        max_frames: int = 16,
        frame_interval: int = 30,
    ) -> list[np.ndarray]:
        """Extract frames as a list (loads all into memory)."""
        return [frame for _, frame in self.extract_frames(video_path, max_frames, frame_interval)]

video_service = VideoService()
