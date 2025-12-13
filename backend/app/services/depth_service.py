import torch
import numpy as np
import base64
from typing import Callable, Optional
from pathlib import Path
import logging

from ..models.schemas import ProgressUpdate, DepthFrame, CameraParameters, ProcessingResult
from ..config import settings

logger = logging.getLogger(__name__)

class DepthService:
    """Service for Depth Anything V3 inference."""

    def __init__(self):
        self._model = None
        self._device = None

    async def initialize(self, model_name: Optional[str] = None):
        """Initialize the DA3 model."""
        if self._model is not None:
            return

        model_name = model_name or settings.model_name
        logger.info(f"Loading DA3 model: {model_name}")

        try:
            from depth_anything_3.api import DepthAnything3

            self._device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            logger.info(f"Using device: {self._device}")

            self._model = DepthAnything3.from_pretrained(f"depth-anything/{model_name}")
            self._model = self._model.to(device=self._device)

            logger.info("DA3 model loaded successfully")
        except ImportError:
            logger.error("depth-anything-3 package not installed")
            raise RuntimeError("DA3 package not available. Install from: https://github.com/ByteDance-Seed/Depth-Anything-3")

    def _encode_array(self, arr: np.ndarray) -> str:
        """Encode numpy array as base64."""
        return base64.b64encode(arr.astype(np.float32).tobytes()).decode('utf-8')

    async def estimate_depth(
        self,
        frames: list[np.ndarray],
        job_id: str,
        progress_callback: Optional[Callable[[ProgressUpdate], None]] = None,
    ) -> ProcessingResult:
        """
        Run DA3 multi-view inference on frames.

        Args:
            frames: List of RGB numpy arrays [H, W, 3]
            job_id: Job identifier
            progress_callback: Callback for progress updates

        Returns:
            ProcessingResult with depth maps and camera parameters
        """
        if self._model is None:
            await self.initialize()

        if progress_callback:
            progress_callback(ProgressUpdate(
                stage="Loading model",
                progress=10.0,
                message="DA3 model ready"
            ))

        logger.info(f"Processing {len(frames)} frames")

        if progress_callback:
            progress_callback(ProgressUpdate(
                stage="Processing depth",
                progress=20.0,
                current_frame=0,
                total_frames=len(frames),
                message="Running DA3 inference..."
            ))

        # Run inference
        try:
            prediction = self._model.inference(
                frames,
                process_res=settings.process_resolution,
            )

            if progress_callback:
                progress_callback(ProgressUpdate(
                    stage="Processing depth",
                    progress=80.0,
                    current_frame=len(frames),
                    total_frames=len(frames),
                    message="Inference complete"
                ))

            # Extract results
            depth_maps = prediction.depth  # [N, H, W]
            conf_maps = getattr(prediction, 'conf', None)  # [N, H, W] if available
            extrinsics = getattr(prediction, 'extrinsics', None)  # [N, 3, 4]
            intrinsics = getattr(prediction, 'intrinsics', None)  # [N, 3, 3]

            # Convert to serializable format
            depth_frames = []
            for i in range(len(frames)):
                depth_map = depth_maps[i]

                # Normalize depth to 0-1 range
                depth_min = depth_map.min()
                depth_max = depth_map.max()
                if depth_max > depth_min:
                    depth_normalized = (depth_map - depth_min) / (depth_max - depth_min)
                else:
                    depth_normalized = np.zeros_like(depth_map)

                frame_data = DepthFrame(
                    frame_index=i,
                    depth_map_b64=self._encode_array(depth_normalized),
                    width=depth_map.shape[1],
                    height=depth_map.shape[0],
                    confidence_b64=self._encode_array(conf_maps[i]) if conf_maps is not None else None,
                )
                depth_frames.append(frame_data)

            # Camera parameters if available
            camera_params = None
            if extrinsics is not None and intrinsics is not None:
                camera_params = CameraParameters(
                    extrinsics=extrinsics.tolist() if hasattr(extrinsics, 'tolist') else extrinsics,
                    intrinsics=intrinsics.tolist() if hasattr(intrinsics, 'tolist') else intrinsics,
                )

            if progress_callback:
                progress_callback(ProgressUpdate(
                    stage="Complete",
                    progress=100.0,
                    message="Processing complete"
                ))

            # Get original dimensions from first frame
            original_height, original_width = frames[0].shape[:2]

            return ProcessingResult(
                job_id=job_id,
                frames=depth_frames,
                camera_params=camera_params,
                original_width=original_width,
                original_height=original_height,
                model_used=settings.model_name,
            )

        except Exception as e:
            logger.error(f"Inference failed: {e}")
            raise
        finally:
            # Clear CUDA cache
            if torch.cuda.is_available():
                torch.cuda.empty_cache()

depth_service = DepthService()
