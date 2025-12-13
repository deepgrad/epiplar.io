"""
Fast depth map hole filling using ip_basic algorithm.

Based on: https://github.com/kujason/ip_basic
"In Defense of Classical Image Processing: Fast Depth Completion on the CPU"

Performance: ~90 FPS (0.011s per frame) on CPU
"""

import numpy as np
import cv2
from typing import Optional
import logging

logger = logging.getLogger(__name__)


class DepthCompletion:
    """
    Fast depth map hole filling using morphological operations.

    This implementation is based on the ip_basic algorithm which achieves
    90 FPS on CPU using only OpenCV operations.

    Stages:
    1. Dilation to fill small holes
    2. Morphological closing for larger gaps
    3. Bilateral/Gaussian filtering for smooth transitions
    4. Optional extrapolation for top regions (common in room scans)
    """

    def __init__(
        self,
        extrapolate: bool = True,
        blur_type: str = 'bilateral',
        small_kernel_size: int = 5,
        large_kernel_size: int = 31,
    ):
        """
        Initialize depth completion.

        Args:
            extrapolate: Fill top regions (useful for room scans where ceiling is often missing)
            blur_type: 'bilateral' (edge-preserving) or 'gaussian' (faster)
            small_kernel_size: Kernel size for initial dilation (odd number)
            large_kernel_size: Kernel size for morphological closing (odd number)
        """
        self.extrapolate = extrapolate
        self.blur_type = blur_type
        self.small_kernel_size = small_kernel_size
        self.large_kernel_size = large_kernel_size

        # Pre-create kernels for efficiency
        self._kernel_small = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (small_kernel_size, small_kernel_size)
        )
        self._kernel_large = cv2.getStructuringElement(
            cv2.MORPH_ELLIPSE, (large_kernel_size, large_kernel_size)
        )
        self._kernel_extrapolate = cv2.getStructuringElement(
            cv2.MORPH_RECT, (3, large_kernel_size)
        )

    def complete(
        self,
        depth_map: np.ndarray,
        confidence_map: Optional[np.ndarray] = None,
        conf_threshold: float = 0.3,
    ) -> np.ndarray:
        """
        Fill holes in depth map.

        Args:
            depth_map: [H, W] depth values (any scale)
            confidence_map: [H, W] confidence values (0-1), low = holes
            conf_threshold: Confidence below this is considered a hole

        Returns:
            Completed depth map with same shape and scale as input
        """
        if depth_map.ndim != 2:
            raise ValueError(f"Expected 2D depth map, got shape {depth_map.shape}")

        # Create validity mask based on confidence or depth values
        if confidence_map is not None:
            valid_mask = (confidence_map >= conf_threshold) & (depth_map > 0) & np.isfinite(depth_map)
        else:
            valid_mask = (depth_map > 0) & np.isfinite(depth_map)

        # Handle edge case: no valid depth values
        if not valid_mask.any():
            logger.warning("No valid depth values found, returning original")
            return depth_map.copy()

        # Normalize depth to uint16 range for processing
        depth_valid = depth_map[valid_mask]
        depth_min = float(np.min(depth_valid))
        depth_max = float(np.max(depth_valid))
        depth_range = depth_max - depth_min

        if depth_range <= 0:
            logger.warning("Zero depth range, returning original")
            return depth_map.copy()

        # Normalize to 0-65535 range
        depth_norm = ((depth_map - depth_min) / depth_range * 65535).astype(np.float32)
        depth_norm[~valid_mask] = 0
        depth_u16 = depth_norm.astype(np.uint16)

        # Stage 1: Initial dilation to fill small holes
        depth_filled = cv2.dilate(depth_u16, self._kernel_small)

        # Stage 2: Morphological closing for larger gaps
        depth_filled = cv2.morphologyEx(depth_filled, cv2.MORPH_CLOSE, self._kernel_large)

        # Stage 3: Smoothing for natural transitions
        if self.blur_type == 'bilateral':
            # Bilateral filter preserves edges while smoothing
            depth_filled = cv2.bilateralFilter(
                depth_filled.astype(np.float32),
                d=9,
                sigmaColor=75,
                sigmaSpace=75
            ).astype(np.uint16)
        else:
            # Gaussian is faster but doesn't preserve edges as well
            depth_filled = cv2.GaussianBlur(depth_filled, (5, 5), 0)

        # Stage 4: Extrapolation for top regions (optional)
        if self.extrapolate:
            # Dilate upward to fill ceiling/sky regions
            depth_filled = cv2.dilate(depth_filled, self._kernel_extrapolate)

        # Convert back to original scale
        result = depth_filled.astype(np.float32) / 65535 * depth_range + depth_min

        # Preserve original valid depth values (don't modify good data)
        result[valid_mask] = depth_map[valid_mask]

        return result

    def complete_batch(
        self,
        depth_maps: np.ndarray,
        confidence_maps: Optional[np.ndarray] = None,
        conf_threshold: float = 0.3,
    ) -> np.ndarray:
        """
        Fill holes in multiple depth maps.

        Args:
            depth_maps: [N, H, W] depth values
            confidence_maps: [N, H, W] confidence values (0-1), or None
            conf_threshold: Confidence below this is considered a hole

        Returns:
            Completed depth maps [N, H, W]
        """
        if depth_maps.ndim != 3:
            raise ValueError(f"Expected 3D array [N, H, W], got shape {depth_maps.shape}")

        N = depth_maps.shape[0]
        result = np.zeros_like(depth_maps)

        for i in range(N):
            conf_map = confidence_maps[i] if confidence_maps is not None else None
            result[i] = self.complete(depth_maps[i], conf_map, conf_threshold)

        return result


# Module-level instance for convenience
_default_completer: Optional[DepthCompletion] = None


def get_depth_completer(
    extrapolate: bool = True,
    blur_type: str = 'bilateral',
) -> DepthCompletion:
    """Get or create a depth completer instance."""
    global _default_completer
    if _default_completer is None:
        _default_completer = DepthCompletion(
            extrapolate=extrapolate,
            blur_type=blur_type,
        )
    return _default_completer


def complete_depth_map(
    depth_map: np.ndarray,
    confidence_map: Optional[np.ndarray] = None,
    conf_threshold: float = 0.3,
) -> np.ndarray:
    """
    Convenience function to fill holes in a single depth map.

    Args:
        depth_map: [H, W] depth values
        confidence_map: [H, W] confidence values (0-1), or None
        conf_threshold: Confidence below this is considered a hole

    Returns:
        Completed depth map
    """
    completer = get_depth_completer()
    return completer.complete(depth_map, confidence_map, conf_threshold)
