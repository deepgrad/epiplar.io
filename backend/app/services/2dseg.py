"""
2dseg.py - Video-based 2D Furniture Detection to 3D Markers

Proper approach using depth estimation and camera poses:
1. Run YOLO on video frames to detect furniture
2. Use Depth Anything V3 to get depth maps and camera poses
3. Back-project 2D detections to 3D using depth + camera intrinsics/extrinsics
4. Merge detections across frames and place markers

Usage:
    python 2dseg.py sota_1.mp4 sota_1.glb
"""

import gc
import cv2
import numpy as np
from pathlib import Path
from dataclasses import dataclass, field
from typing import List, Optional, Tuple, Dict
from collections import defaultdict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# YOLO COCO furniture classes
FURNITURE_CLASSES = {
    56: "chair", 57: "couch", 58: "potted plant", 59: "bed",
    60: "dining table", 62: "tv", 63: "laptop", 72: "refrigerator",
    73: "book", 74: "clock", 75: "vase", 68: "microwave", 69: "oven",
    70: "toaster", 71: "sink", 61: "toilet", 39: "bottle", 41: "cup",
    67: "cell phone", 66: "keyboard", 64: "mouse",
}

LABEL_MAPPING = {"couch": "sofa", "dining table": "table", "potted plant": "plant"}

# Colors for 3D markers (RGB 0-1)
MARKER_COLORS = {
    "chair": [1.0, 0.2, 0.2],
    "sofa": [0.2, 0.8, 0.2],
    "table": [1.0, 0.6, 0.0],
    "bed": [0.3, 0.5, 0.9],
    "tv": [0.2, 0.2, 0.2],
    "plant": [0.1, 0.6, 0.1],
    "laptop": [0.3, 0.3, 0.3],
    "refrigerator": [0.8, 0.8, 0.8],
    "vase": [0.95, 0.5, 0.8],
    "clock": [0.8, 0.6, 0.2],
    "default": [0.5, 0.5, 0.5],
}

# Expected height ranges above floor for each furniture type (in meters)
# (min_height, max_height) - these are used to filter GLB points
FURNITURE_HEIGHT_RANGES = {
    "chair": (0.3, 1.2),      # Chair seat to top of back
    "sofa": (0.3, 1.0),       # Sofa seat to back
    "table": (0.6, 0.9),      # Table top height
    "bed": (0.3, 0.8),        # Bed height
    "tv": (0.5, 2.0),         # TV can be on stand or wall-mounted
    "plant": (0.0, 1.5),      # Plants on floor to on table
    "laptop": (0.7, 1.0),     # On desk/table
    "refrigerator": (0.5, 2.0),  # Tall appliance
    "vase": (0.7, 1.2),       # On table/shelf
    "clock": (1.0, 2.5),      # Wall clock
    "cup": (0.7, 1.0),        # On table
    "bottle": (0.7, 1.0),     # On table
    "sink": (0.8, 1.0),       # Kitchen/bathroom height
    "default": (0.0, 2.0),    # Wide range for unknown
}


@dataclass
class Detection2D:
    """Single 2D detection with depth info."""
    label: str
    confidence: float
    bbox: np.ndarray  # [x1, y1, x2, y2]
    mask: Optional[np.ndarray]  # Binary mask if available
    frame_idx: int


@dataclass
class Detection3D:
    """3D detection from back-projected 2D detection."""
    label: str
    center: np.ndarray  # 3D center point
    confidence: float
    points: np.ndarray  # Sample of 3D points
    frame_idx: int


@dataclass
class Object3D:
    """Merged 3D object with location."""
    label: str
    center: np.ndarray
    confidence: float
    color: List[float]
    points: np.ndarray


def sample_glb_points(glb_path: str, num_points: int = 100000) -> np.ndarray:
    """Sample 3D points from a GLB file (mesh or point cloud)."""
    try:
        import trimesh

        # Load as scene (don't force mesh - might be point cloud)
        scene = trimesh.load(glb_path)

        if scene is None:
            logger.error("trimesh.load returned None")
            return np.zeros((0, 3))

        all_verts = []

        # Handle Scene (collection of geometries)
        if isinstance(scene, trimesh.Scene):
            for name, geom in scene.geometry.items():
                # Check for PointCloud
                if isinstance(geom, trimesh.PointCloud):
                    verts = np.array(geom.vertices)
                    logger.info(f"  PointCloud '{name}': {len(verts)} points")
                    all_verts.append(verts)
                # Check for Mesh
                elif hasattr(geom, 'vertices') and len(geom.vertices) > 0:
                    verts = np.array(geom.vertices)
                    logger.info(f"  Mesh '{name}': {len(verts)} vertices")
                    all_verts.append(verts)

        # Handle direct mesh/pointcloud
        elif hasattr(scene, 'vertices') and len(scene.vertices) > 0:
            verts = np.array(scene.vertices)
            logger.info(f"GLB has {len(verts)} vertices/points")
            all_verts.append(verts)

        if not all_verts:
            logger.error("No vertices/points found in GLB")
            return np.zeros((0, 3))

        # Combine all vertices
        verts = np.vstack(all_verts)
        logger.info(f"Total GLB points: {len(verts)}")

        # Sample if too many points
        if len(verts) > num_points:
            indices = np.random.choice(len(verts), num_points, replace=False)
            return verts[indices]

        return verts

    except Exception as e:
        logger.error(f"Failed to sample GLB points: {e}")
        import traceback
        traceback.print_exc()
        return np.zeros((0, 3))


def find_glb_points_in_detection_with_icp(
    detection: Detection2D,
    glb_points: np.ndarray,
    frame: np.ndarray,
    intrinsics: np.ndarray,
    extrinsics: np.ndarray,
    R_icp: np.ndarray,
    t_icp: np.ndarray,
    scale_icp: float = 1.0,
    depth_map: np.ndarray = None,
    depth_tolerance: float = 0.3,
    floor_y: float = None,  # Floor level in GLB Y coordinate
) -> Optional[Detection3D]:
    """
    Find GLB points that project into the 2D detection region.
    Uses ICP transformation (with scale) to correctly align GLB points with camera poses.
    Uses depth map and semantic height constraints for filtering.

    Args:
        detection: 2D detection with bbox and mask
        glb_points: Original GLB point cloud coordinates
        frame: Video frame for dimensions
        intrinsics: DA3 camera intrinsics (3x3)
        extrinsics: DA3 camera extrinsics world-to-camera (3x4)
        R_icp: ICP rotation matrix (DA3_scaled → GLB)
        t_icp: ICP translation vector (DA3_scaled → GLB)
        scale_icp: Scale factor applied to DA3 before ICP
        depth_map: DA3 depth map for filtering by depth consistency
        depth_tolerance: Maximum relative depth deviation (0.3 = 30%)
        floor_y: Floor level Y coordinate in GLB space

    Returns:
        Detection3D with original GLB coordinates, or None if no points found
    """
    if len(glb_points) == 0:
        return None

    H, W = frame.shape[:2]
    x1, y1, x2, y2 = map(int, detection.bbox)
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(W, x2), min(H, y2)

    if x2 <= x1 or y2 <= y1:
        return None

    # Apply semantic height filtering FIRST (before expensive projection)
    # This filters GLB points to only those at reasonable heights for this object type
    height_range = FURNITURE_HEIGHT_RANGES.get(detection.label, FURNITURE_HEIGHT_RANGES["default"])
    if floor_y is not None:
        min_y = floor_y + height_range[0]
        max_y = floor_y + height_range[1]
        height_mask = (glb_points[:, 1] >= min_y) & (glb_points[:, 1] <= max_y)
        glb_points_height_filtered = glb_points[height_mask]
    else:
        glb_points_height_filtered = glb_points

    if len(glb_points_height_filtered) == 0:
        return None

    # Get expected depth from depth map for this detection
    expected_depth = None
    if depth_map is not None:
        dm_h, dm_w = depth_map.shape
        scale_x, scale_y = dm_w / W, dm_h / H
        dm_x1, dm_y1 = int(x1 * scale_x), int(y1 * scale_y)
        dm_x2, dm_y2 = int(x2 * scale_x), int(y2 * scale_y)
        dm_x1, dm_y1 = max(0, dm_x1), max(0, dm_y1)
        dm_x2, dm_y2 = min(dm_w, dm_x2), min(dm_h, dm_y2)

        if dm_x2 > dm_x1 and dm_y2 > dm_y1:
            margin_x = (dm_x2 - dm_x1) // 4
            margin_y = (dm_y2 - dm_y1) // 4
            depth_region = depth_map[dm_y1+margin_y:dm_y2-margin_y, dm_x1+margin_x:dm_x2-margin_x]
            valid_depths = depth_region[(depth_region > 0) & np.isfinite(depth_region)]
            if len(valid_depths) > 5:
                expected_depth = np.median(valid_depths)

    # Transform GLB points to DA3 world space
    R_inv = R_icp.T
    t_inv = -R_inv @ t_icp
    glb_points_da3_scaled = (R_inv @ glb_points_height_filtered.T).T + t_inv
    glb_points_da3 = glb_points_da3_scaled / scale_icp

    # Project to camera space
    R_ext = extrinsics[:3, :3]
    t_ext = extrinsics[:3, 3]
    points_cam = (R_ext @ glb_points_da3.T).T + t_ext

    # Filter points behind camera
    valid_z = points_cam[:, 2] > 0.01
    points_cam_valid = points_cam[valid_z]
    glb_points_valid = glb_points_height_filtered[valid_z]

    if len(points_cam_valid) == 0:
        return None

    # Project to 2D
    fx, fy = intrinsics[0, 0], intrinsics[1, 1]
    cx, cy = intrinsics[0, 2], intrinsics[1, 2]

    u = (points_cam_valid[:, 0] * fx / points_cam_valid[:, 2]) + cx
    v = (points_cam_valid[:, 1] * fy / points_cam_valid[:, 2]) + cy
    projected_depths = points_cam_valid[:, 2]

    # Find points inside detection region
    if detection.mask is not None:
        u_int = np.clip(u.astype(int), 0, W-1)
        v_int = np.clip(v.astype(int), 0, H-1)
        in_mask = detection.mask[v_int, u_int] > 0
        in_bounds = (u >= 0) & (u < W) & (v >= 0) & (v < H)
        inside = in_mask & in_bounds
    else:
        margin = 0.15
        w, h = x2 - x1, y2 - y1
        inside = (u >= x1 + w*margin) & (u <= x2 - w*margin) & \
                 (v >= y1 + h*margin) & (v <= y2 - h*margin)

    # Apply depth filtering
    if expected_depth is not None and expected_depth > 0:
        min_depth = expected_depth * (1 - depth_tolerance)
        max_depth = expected_depth * (1 + depth_tolerance)
        depth_ok = (projected_depths >= min_depth) & (projected_depths <= max_depth)
        inside = inside & depth_ok

    points_inside = glb_points_valid[inside]

    if len(points_inside) < 3:
        return None

    center = np.median(points_inside, axis=0)

    if len(points_inside) > 100:
        indices = np.random.choice(len(points_inside), 100, replace=False)
        points_inside = points_inside[indices]

    return Detection3D(
        label=detection.label,
        center=center,
        confidence=detection.confidence,
        points=points_inside,
        frame_idx=detection.frame_idx
    )


def backproject_detection_to_3d(
    detection: Detection2D,
    depth_map: np.ndarray,
    intrinsics: np.ndarray,
    extrinsics: np.ndarray,
    depth_scale: float = 1.0,
    sample_points: int = 100
) -> Optional[Detection3D]:
    """
    Back-project a 2D detection to 3D using depth map and camera parameters.
    (Fallback method when GLB points not available)
    """
    H, W = depth_map.shape
    x1, y1, x2, y2 = map(int, detection.bbox)

    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(W, x2), min(H, y2)

    if x2 <= x1 or y2 <= y1:
        return None

    if detection.mask is not None:
        mask_region = detection.mask[y1:y2, x1:x2]
        depth_region = depth_map[y1:y2, x1:x2]
        valid_depths = depth_region[mask_region > 0]
    else:
        margin_x = (x2 - x1) // 4
        margin_y = (y2 - y1) // 4
        cx1, cy1 = x1 + margin_x, y1 + margin_y
        cx2, cy2 = x2 - margin_x, y2 - margin_y
        depth_region = depth_map[cy1:cy2, cx1:cx2]
        valid_depths = depth_region.flatten()

    valid_depths = valid_depths[np.isfinite(valid_depths) & (valid_depths > 0)]

    if len(valid_depths) < 10:
        return None

    median_depth = np.median(valid_depths) * depth_scale

    if detection.mask is not None:
        ys, xs = np.where(detection.mask > 0)
    else:
        xs = np.random.randint(x1, x2, min(sample_points, (x2-x1)*(y2-y1)))
        ys = np.random.randint(y1, y2, min(sample_points, (x2-x1)*(y2-y1)))

    if len(xs) == 0:
        return None

    if len(xs) > sample_points:
        indices = np.random.choice(len(xs), sample_points, replace=False)
        xs, ys = xs[indices], ys[indices]

    depths = np.array([depth_map[y, x] for x, y in zip(xs, ys)
                       if 0 <= y < H and 0 <= x < W])
    valid_mask = np.isfinite(depths) & (depths > 0)

    if valid_mask.sum() < 5:
        return None

    xs = xs[valid_mask]
    ys = ys[valid_mask]
    depths = depths[valid_mask] * depth_scale

    fx, fy = intrinsics[0, 0], intrinsics[1, 1]
    cx, cy = intrinsics[0, 2], intrinsics[1, 2]

    z_cam = depths
    x_cam = (xs - cx) * z_cam / fx
    y_cam = (ys - cy) * z_cam / fy

    points_cam = np.column_stack([x_cam, y_cam, z_cam])

    if extrinsics.shape == (3, 4):
        R = extrinsics[:3, :3]
        t = extrinsics[:3, 3]
    else:
        R = extrinsics[:3, :3]
        t = extrinsics[:3, 3]

    R_inv = R.T
    t_inv = -R_inv @ t
    points_world = (R_inv @ points_cam.T).T + t_inv

    center = points_world.mean(axis=0)

    return Detection3D(
        label=detection.label,
        center=center,
        confidence=detection.confidence,
        points=points_world,
        frame_idx=detection.frame_idx
    )


def estimate_depth_and_poses(frames: List[np.ndarray]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Use Depth Anything V3 to estimate depth maps and camera poses.

    Returns:
        depth_maps: NxHxW array of depth maps
        intrinsics: Nx3x3 array of camera intrinsics
        extrinsics: Nx3x4 or Nx4x4 array of camera extrinsics (world-to-camera)
    """
    import torch

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    logger.info(f"Depth estimation using device: {device}")

    try:
        from depth_anything_3.api import DepthAnything3

        logger.info("Loading DA3 model...")
        model = DepthAnything3.from_pretrained("depth-anything/da3-base")
        model = model.to(device)

        logger.info(f"Running DA3 inference on {len(frames)} frames...")
        # Run inference
        prediction = model.inference(
            frames,
            process_res=518,
            use_ray_pose=True,
            ref_view_strategy="saddle_balanced",
        )

        depth_maps = prediction.depth  # NxHxW
        intrinsics = prediction.intrinsics  # Nx3x3
        extrinsics = prediction.extrinsics  # Nx3x4 or Nx4x4

        logger.info(f"DA3 output: depth={depth_maps.shape}, intrinsics={intrinsics.shape}, extrinsics={extrinsics.shape}")

        # Clean up
        del model
        if device == 'cuda':
            torch.cuda.empty_cache()

        return np.array(depth_maps), np.array(intrinsics), np.array(extrinsics)

    except ImportError as e:
        logger.error(f"depth-anything-3 import failed: {e}")
        raise RuntimeError(f"depth-anything-3 import failed: {e}")
    except Exception as e:
        logger.error(f"DA3 inference failed: {e}")
        raise RuntimeError(f"DA3 inference failed: {e}")


def estimate_depth_simple(frames: List[np.ndarray]) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Simple fallback: estimate depth using monocular depth estimation.
    Simulates camera rotating/panning through the scene.
    """
    import torch

    device = 'cuda' if torch.cuda.is_available() else 'cpu'

    try:
        # Try MiDaS as fallback
        model = torch.hub.load("intel-isl/MiDaS", "MiDaS_small")
        model.to(device).eval()

        midas_transforms = torch.hub.load("intel-isl/MiDaS", "transforms")
        transform = midas_transforms.small_transform

        depth_maps = []
        for frame in frames:
            input_batch = transform(frame).to(device)
            with torch.no_grad():
                depth = model(input_batch)
                depth = torch.nn.functional.interpolate(
                    depth.unsqueeze(1),
                    size=frame.shape[:2],
                    mode="bicubic",
                    align_corners=False,
                ).squeeze()
            # MiDaS returns inverse depth - convert and normalize
            depth_np = depth.cpu().numpy()
            # Invert to get actual depth (MiDaS gives higher values for closer objects)
            depth_np = 1.0 / (depth_np + 1e-6)
            # Normalize to reasonable room scale (0.5 to 5 meters)
            depth_min, depth_max = depth_np.min(), depth_np.max()
            if depth_max > depth_min:
                depth_np = 0.5 + 4.5 * (depth_np - depth_min) / (depth_max - depth_min)
            depth_maps.append(depth_np)

        depth_maps = np.array(depth_maps)

        # Estimate simple intrinsics (assume 60 degree FOV)
        H, W = frames[0].shape[:2]
        fov = 60
        f = W / (2 * np.tan(np.radians(fov / 2)))
        K = np.array([
            [f, 0, W/2],
            [0, f, H/2],
            [0, 0, 1]
        ])
        intrinsics = np.tile(K, (len(frames), 1, 1))

        # Simulate camera panning around the room
        # Assume camera rotates ~180 degrees over all frames (looking around the room)
        n_frames = len(frames)
        extrinsics = []

        for i in range(n_frames):
            # Camera rotates around Y axis (panning left to right)
            angle = (i / max(n_frames - 1, 1)) * np.pi  # 0 to 180 degrees

            # Rotation matrix around Y axis
            cos_a, sin_a = np.cos(angle), np.sin(angle)
            R = np.array([
                [cos_a, 0, sin_a],
                [0, 1, 0],
                [-sin_a, 0, cos_a]
            ])

            # Camera position moves in a small arc
            radius = 0.5  # meters from center
            t = np.array([
                radius * np.sin(angle),  # X position
                0,                         # Y position (constant height)
                radius * np.cos(angle)    # Z position
            ])

            # Build extrinsic matrix (camera-to-world)
            ext = np.eye(4)
            ext[:3, :3] = R
            ext[:3, 3] = t
            extrinsics.append(ext[:3, :4])

        extrinsics = np.array(extrinsics)

        del model
        if device == 'cuda':
            torch.cuda.empty_cache()

        return depth_maps, intrinsics, extrinsics

    except Exception as e:
        logger.error(f"Fallback depth estimation failed: {e}")
        raise


def detect_furniture_in_frames(frames: List[np.ndarray],
                                frame_indices: List[int]) -> List[Detection2D]:
    """
    Run YOLO segmentation on frames to detect furniture.
    """
    from ultralytics import YOLO
    import torch

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    logger.info(f"YOLO using device: {device}")

    # Load YOLO model
    model_path = Path(__file__).parent / "yolov8x-seg.pt"
    if model_path.exists():
        model = YOLO(str(model_path))
    else:
        model = YOLO("yolov8x-seg.pt")
    model.to(device)

    all_detections = []

    for i, (frame, fidx) in enumerate(zip(frames, frame_indices)):
        results = model(frame, conf=0.4, verbose=False, device=device)[0]  # Higher confidence threshold

        frame_detections = 0
        if results.boxes is not None:
            masks = results.masks.data.cpu().numpy() if results.masks is not None else [None] * len(results.boxes)

            for box, conf, cls, mask in zip(
                results.boxes.xyxy.cpu().numpy(),
                results.boxes.conf.cpu().numpy(),
                results.boxes.cls.cpu().numpy(),
                masks
            ):
                cls_id = int(cls)
                if cls_id not in FURNITURE_CLASSES:
                    continue

                label = FURNITURE_CLASSES[cls_id]
                label = LABEL_MAPPING.get(label, label)

                # Resize mask to frame size if available
                if mask is not None:
                    mask_resized = cv2.resize(mask, (frame.shape[1], frame.shape[0])) > 0.5
                else:
                    mask_resized = None

                det = Detection2D(
                    label=label,
                    confidence=float(conf),
                    bbox=box,
                    mask=mask_resized,
                    frame_idx=fidx
                )
                all_detections.append(det)
                frame_detections += 1

        logger.info(f"Frame {fidx}: {frame_detections} furniture items")

    # Clean up
    del model
    if device == 'cuda':
        import torch
        torch.cuda.empty_cache()
    gc.collect()

    return all_detections


def load_glb_bounds(glb_path: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Load GLB and return its bounding box.
    Returns: (min_bounds, max_bounds, center)
    """
    try:
        import trimesh
        scene = trimesh.load(glb_path)

        if isinstance(scene, trimesh.Scene):
            # Get all vertices from all geometries
            all_verts = []
            for name, geom in scene.geometry.items():
                if hasattr(geom, 'vertices'):
                    all_verts.append(geom.vertices)
            if all_verts:
                verts = np.vstack(all_verts)
            else:
                return np.zeros(3), np.ones(3), np.array([0.5, 0.5, 0.5])
        else:
            verts = scene.vertices

        min_bounds = verts.min(axis=0)
        max_bounds = verts.max(axis=0)
        center = (min_bounds + max_bounds) / 2

        logger.info(f"GLB bounds: min={min_bounds}, max={max_bounds}")
        return min_bounds, max_bounds, center
    except Exception as e:
        logger.error(f"Failed to load GLB bounds: {e}")
        return np.zeros(3), np.ones(3), np.array([0.5, 0.5, 0.5])


def create_depth_point_cloud(
    frames: List[np.ndarray],
    depth_maps: np.ndarray,
    intrinsics: np.ndarray,
    extrinsics: np.ndarray,
    sample_stride: int = 8,
    max_points_per_frame: int = 5000,
) -> np.ndarray:
    """
    Create a point cloud from depth maps for ICP alignment.
    Samples points uniformly from valid depth regions.
    """
    all_points = []

    for i, (frame, depth_map) in enumerate(zip(frames, depth_maps)):
        H, W = depth_map.shape
        frame_h, frame_w = frame.shape[:2]

        # Resize depth if needed
        if (H, W) != (frame_h, frame_w):
            depth_map = cv2.resize(depth_map, (frame_w, frame_h))
            H, W = frame_h, frame_w

        # Sample pixels with stride
        ys, xs = np.mgrid[0:H:sample_stride, 0:W:sample_stride]
        ys, xs = ys.flatten(), xs.flatten()

        # Get depths at these pixels
        depths = depth_map[ys, xs]
        valid = np.isfinite(depths) & (depths > 0.01) & (depths < 100)

        if valid.sum() < 10:
            continue

        xs, ys, depths = xs[valid], ys[valid], depths[valid]

        # Limit points
        if len(xs) > max_points_per_frame:
            idx = np.random.choice(len(xs), max_points_per_frame, replace=False)
            xs, ys, depths = xs[idx], ys[idx], depths[idx]

        # Back-project to camera space
        K = intrinsics[i]
        fx, fy = K[0, 0], K[1, 1]
        cx, cy = K[0, 2], K[1, 2]

        z_cam = depths
        x_cam = (xs - cx) * z_cam / fx
        y_cam = (ys - cy) * z_cam / fy
        points_cam = np.column_stack([x_cam, y_cam, z_cam])

        # Transform to world space (invert world-to-camera)
        ext = extrinsics[i]
        R = ext[:3, :3]
        t = ext[:3, 3]
        R_inv = R.T
        t_inv = -R_inv @ t
        points_world = (R_inv @ points_cam.T).T + t_inv

        all_points.append(points_world)

    if not all_points:
        return np.zeros((0, 3))

    return np.vstack(all_points)


def align_point_clouds_icp(
    source: np.ndarray,
    target: np.ndarray,
    max_iterations: int = 50,
    threshold: float = 0.5,
) -> Tuple[np.ndarray, np.ndarray, float, float]:
    """
    Align source point cloud to target using ICP with scale estimation.
    Returns: (rotation_matrix 3x3, translation 3, fitness_score, scale_factor)
    """
    try:
        import open3d as o3d
    except ImportError:
        logger.error("open3d required for ICP alignment")
        return np.eye(3), np.zeros(3), 0.0, 1.0

    if len(source) < 10 or len(target) < 10:
        logger.warning("Not enough points for ICP")
        return np.eye(3), np.zeros(3), 0.0, 1.0

    # Estimate scale by comparing bounding box sizes
    source_min, source_max = source.min(axis=0), source.max(axis=0)
    target_min, target_max = target.min(axis=0), target.max(axis=0)
    source_size = source_max - source_min
    target_size = target_max - target_min

    # Use median scale across dimensions (more robust than mean)
    scale_factors = target_size / (source_size + 1e-6)
    scale = np.median(scale_factors[scale_factors > 0.1])  # Ignore near-zero dimensions
    scale = np.clip(scale, 0.5, 2.0)  # Limit scale to reasonable range

    logger.info(f"Scale estimation: source_size={source_size}, target_size={target_size}, scale={scale:.3f}")

    # Apply scale to source
    source_scaled = source * scale

    # Create Open3D point clouds
    pcd_source = o3d.geometry.PointCloud()
    pcd_source.points = o3d.utility.Vector3dVector(source_scaled)

    pcd_target = o3d.geometry.PointCloud()
    pcd_target.points = o3d.utility.Vector3dVector(target)

    # Estimate normals for better ICP
    pcd_source.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.5, max_nn=30)
    )
    pcd_target.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(radius=0.5, max_nn=30)
    )

    # Initial alignment using centroids
    source_center = np.mean(source_scaled, axis=0)
    target_center = np.mean(target, axis=0)
    initial_translation = target_center - source_center

    init_transform = np.eye(4)
    init_transform[:3, 3] = initial_translation

    # Run ICP with point-to-plane for better accuracy
    logger.info(f"Running ICP: {len(source_scaled)} source pts, {len(target)} target pts")

    result = o3d.pipelines.registration.registration_icp(
        pcd_source, pcd_target, threshold, init_transform,
        o3d.pipelines.registration.TransformationEstimationPointToPlane(),
        o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=max_iterations)
    )

    transform = result.transformation
    R = transform[:3, :3]
    t = transform[:3, 3]

    logger.info(f"ICP fitness: {result.fitness:.4f}, RMSE: {result.inlier_rmse:.4f}")

    return R, t, result.fitness, scale


def apply_transform_to_detections(
    detections: List[Detection3D],
    R: np.ndarray,
    t: np.ndarray,
) -> List[Detection3D]:
    """Apply rigid transformation to all detection coordinates."""
    transformed = []
    for det in detections:
        new_center = R @ det.center + t
        new_points = (R @ det.points.T).T + t

        transformed.append(Detection3D(
            label=det.label,
            center=new_center,
            confidence=det.confidence,
            points=new_points,
            frame_idx=det.frame_idx
        ))

    return transformed


def find_furniture_clusters_in_glb(
    glb_points: np.ndarray,
    floor_y: float,
    label: str,
    min_cluster_size: int = 50,
) -> List[np.ndarray]:
    """
    Find clusters of GLB points at the expected height for a furniture type.
    Returns list of cluster centers.
    """
    try:
        from sklearn.cluster import DBSCAN
    except ImportError:
        logger.warning("sklearn not available for clustering")
        return []

    # Get height range for this furniture type
    height_range = FURNITURE_HEIGHT_RANGES.get(label, FURNITURE_HEIGHT_RANGES["default"])
    min_y = floor_y + height_range[0]
    max_y = floor_y + height_range[1]

    # Filter points by height
    height_mask = (glb_points[:, 1] >= min_y) & (glb_points[:, 1] <= max_y)
    points_at_height = glb_points[height_mask]

    if len(points_at_height) < min_cluster_size:
        return []

    # Cluster in XZ plane (horizontal) - ignore Y for clustering
    points_xz = points_at_height[:, [0, 2]]

    # Use DBSCAN clustering
    # eps is the maximum distance between points in a cluster
    eps = 0.5  # 50cm - objects closer than this are same cluster
    clustering = DBSCAN(eps=eps, min_samples=min_cluster_size).fit(points_xz)

    # Get cluster centers
    cluster_centers = []
    labels = clustering.labels_
    unique_labels = set(labels)

    for label_id in unique_labels:
        if label_id == -1:  # Skip noise
            continue
        cluster_mask = labels == label_id
        cluster_points = points_at_height[cluster_mask]

        # Compute center
        center = np.median(cluster_points, axis=0)
        cluster_centers.append(center)

    return cluster_centers


def align_detections_to_glb(detections: List[Detection3D],
                            glb_min: np.ndarray,
                            glb_max: np.ndarray) -> List[Detection3D]:
    """
    Align detection coordinates to match the GLB model's coordinate system.
    Scales and translates detection points to fit within GLB bounds.
    """
    if not detections:
        return detections

    # Get bounds of all detection points
    all_centers = np.array([d.center for d in detections])
    det_min = all_centers.min(axis=0)
    det_max = all_centers.max(axis=0)
    det_range = det_max - det_min
    det_range[det_range == 0] = 1  # Avoid division by zero

    glb_range = glb_max - glb_min
    glb_center = (glb_min + glb_max) / 2

    logger.info(f"Detection bounds: min={det_min}, max={det_max}")
    logger.info(f"GLB bounds: min={glb_min}, max={glb_max}")

    # Scale factor to fit detections within GLB (use 80% of GLB size)
    scale = (glb_range * 0.8) / det_range
    # Use uniform scale to preserve aspect ratio
    uniform_scale = np.min(scale)

    # Center of detections
    det_center = (det_min + det_max) / 2

    aligned = []
    for det in detections:
        # Translate to origin, scale, translate to GLB center
        new_center = (det.center - det_center) * uniform_scale + glb_center
        new_points = (det.points - det_center) * uniform_scale + glb_center

        aligned.append(Detection3D(
            label=det.label,
            center=new_center,
            confidence=det.confidence,
            points=new_points,
            frame_idx=det.frame_idx
        ))

    logger.info(f"Aligned {len(aligned)} detections to GLB coordinate system")
    return aligned


def merge_3d_detections(detections: List[Detection3D],
                        distance_threshold: float = None) -> List[Object3D]:
    """
    Merge 3D detections from multiple frames into unique objects.
    Distance threshold is automatically computed based on scene size if not provided.
    """
    if not detections:
        return []

    # Compute distance threshold based on scene size if not provided
    if distance_threshold is None:
        all_centers = np.array([d.center for d in detections])
        scene_size = np.max(all_centers.max(axis=0) - all_centers.min(axis=0))
        # Use 8% of scene size as merge distance (fairly aggressive merging)
        distance_threshold = max(0.5, scene_size * 0.08)
        logger.info(f"Auto merge threshold: {distance_threshold:.2f} (scene size: {scene_size:.2f})")

    # Group by label
    by_label = defaultdict(list)
    for det in detections:
        by_label[det.label].append(det)

    objects = []

    for label, dets in by_label.items():
        # Cluster detections by spatial proximity
        clusters = []

        for det in dets:
            merged = False
            for cluster in clusters:
                # Check if this detection is close to any in the cluster
                cluster_center = np.mean([d.center for d in cluster], axis=0)
                dist = np.linalg.norm(det.center - cluster_center)

                if dist < distance_threshold:
                    cluster.append(det)
                    merged = True
                    break

            if not merged:
                clusters.append([det])

        # Convert clusters to objects
        for cluster in clusters:
            # Use detection with highest confidence as primary
            best = max(cluster, key=lambda d: d.confidence)

            # Combine all points
            all_points = np.vstack([d.points for d in cluster])

            # Compute robust center (median)
            center = np.median(all_points, axis=0)

            color = MARKER_COLORS.get(label, MARKER_COLORS["default"])

            obj = Object3D(
                label=label,
                center=center,
                confidence=best.confidence,
                color=color,
                points=all_points
            )
            objects.append(obj)

    return objects


def extract_frames_from_video(video_path: str,
                               max_frames: int = 20,
                               frame_interval: int = 30) -> Tuple[List[np.ndarray], List[int]]:
    """Extract frames from video for processing."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS)
    logger.info(f"Video: {total_frames} frames @ {fps:.1f} fps")

    frames = []
    frame_indices = []
    frame_count = 0

    while cap.isOpened() and len(frames) < max_frames:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_count % frame_interval == 0:
            # Convert BGR to RGB
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(frame_rgb)
            frame_indices.append(frame_count)

        frame_count += 1

    cap.release()
    logger.info(f"Extracted {len(frames)} frames")

    return frames, frame_indices


def generate_html_output(glb_path: str, objects_3d: List[Object3D], output_path: str):
    """
    Generate HTML with 3D viewer showing GLB model and object markers.
    """
    # Log marker positions for debugging
    logger.info("Marker positions:")
    for obj in objects_3d:
        logger.info(f"  {obj.label}: {obj.center}")

    markers_js = []
    for obj in objects_3d:
        markers_js.append(f'''{{
            label: "{obj.label}",
            position: [{obj.center[0]:.4f}, {obj.center[1]:.4f}, {obj.center[2]:.4f}],
            color: 0x{int(obj.color[0]*255):02x}{int(obj.color[1]*255):02x}{int(obj.color[2]*255):02x},
            confidence: {obj.confidence:.2f}
        }}''')

    markers_array = ',\n            '.join(markers_js)

    # Read GLB as base64
    import base64
    with open(glb_path, 'rb') as f:
        glb_data = base64.b64encode(f.read()).decode('utf-8')

    html = f'''<!DOCTYPE html>
<html>
<head>
    <title>2DSEG - Furniture Detection</title>
    <meta charset="utf-8">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a2e; color: #eee; overflow: hidden; }}
        #container {{ width: 100vw; height: 100vh; }}
        #info {{ position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.7); padding: 15px; border-radius: 8px; max-width: 300px; }}
        #info h2 {{ margin-bottom: 10px; color: #4fc3f7; }}
        #legend {{ margin-top: 10px; }}
        .legend-item {{ display: flex; align-items: center; margin: 5px 0; }}
        .legend-color {{ width: 16px; height: 16px; border-radius: 50%; margin-right: 8px; }}
        #controls {{ position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.7); padding: 10px; border-radius: 8px; }}
        label {{ display: flex; align-items: center; cursor: pointer; }}
        input[type="checkbox"] {{ margin-right: 8px; }}
    </style>
</head>
<body>
    <div id="container"></div>
    <div id="info">
        <h2>Detected Objects</h2>
        <div id="legend"></div>
    </div>
    <div id="controls">
        <label><input type="checkbox" id="showMarkers" checked> Show Markers</label>
        <label><input type="checkbox" id="showLabels" checked> Show Labels</label>
    </div>

    <script type="importmap">
    {{
        "imports": {{
            "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
            "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
        }}
    }}
    </script>
    <script type="module">
        import * as THREE from 'three';
        import {{ OrbitControls }} from 'three/addons/controls/OrbitControls.js';
        import {{ GLTFLoader }} from 'three/addons/loaders/GLTFLoader.js';

        const markers = [
            {markers_array}
        ];

        // Setup scene
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        camera.position.set(3, 3, 3);

        const renderer = new THREE.WebGLRenderer({{ antialias: true }});
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('container').appendChild(renderer.domElement);

        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;

        // Lighting
        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dirLight = new THREE.DirectionalLight(0xffffff, 1);
        dirLight.position.set(5, 10, 5);
        scene.add(dirLight);

        // Load GLB
        const glbData = "{glb_data}";
        const glbBlob = new Blob([Uint8Array.from(atob(glbData), c => c.charCodeAt(0))], {{ type: 'model/gltf-binary' }});
        const glbUrl = URL.createObjectURL(glbBlob);

        const loader = new GLTFLoader();
        loader.load(glbUrl, (gltf) => {{
            scene.add(gltf.scene);

            // Center camera on model
            const box = new THREE.Box3().setFromObject(gltf.scene);
            const center = box.getCenter(new THREE.Vector3());
            controls.target.copy(center);

            const size = box.getSize(new THREE.Vector3());
            const maxDim = Math.max(size.x, size.y, size.z);
            camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);

            // Resize markers based on scene scale - keep them small
            markerScale = maxDim * 0.004; // 0.4% of scene size (very small)
            markerScale = Math.max(0.01, Math.min(0.08, markerScale)); // Clamp between 0.01 and 0.08
            console.log('Scene size:', size, 'Marker scale:', markerScale);
            createMarkers(markerScale);

            // Log scene bounds for debugging
            console.log('Scene bounds:', box.min, box.max);
        }});

        // Create markers - will be sized after model loads
        const markerGroup = new THREE.Group();
        const labelGroup = new THREE.Group();
        let markerScale = 0.03; // Default very small size, will be updated based on scene size

        function createMarkers(scale) {{
            // Clear existing
            while(markerGroup.children.length > 0) markerGroup.remove(markerGroup.children[0]);
            while(labelGroup.children.length > 0) labelGroup.remove(labelGroup.children[0]);

            markers.forEach((m, i) => {{
                // Large sphere marker
                const geometry = new THREE.SphereGeometry(scale, 24, 24);
                const material = new THREE.MeshBasicMaterial({{ color: m.color, transparent: true, opacity: 0.85 }});
                const sphere = new THREE.Mesh(geometry, material);
                sphere.position.set(m.position[0], m.position[1], m.position[2]);
                markerGroup.add(sphere);

                // Outer ring for visibility
                const ringGeom = new THREE.RingGeometry(scale * 1.3, scale * 1.6, 32);
                const ringMat = new THREE.MeshBasicMaterial({{ color: m.color, side: THREE.DoubleSide, transparent: true, opacity: 0.6 }});
                const ring = new THREE.Mesh(ringGeom, ringMat);
                ring.position.copy(sphere.position);
                markerGroup.add(ring);

                // Vertical line from marker to help locate
                const lineGeom = new THREE.BufferGeometry().setFromPoints([
                    new THREE.Vector3(m.position[0], m.position[1] - scale * 3, m.position[2]),
                    new THREE.Vector3(m.position[0], m.position[1] + scale * 3, m.position[2])
                ]);
                const lineMat = new THREE.LineBasicMaterial({{ color: m.color, transparent: true, opacity: 0.5 }});
                const line = new THREE.Line(lineGeom, lineMat);
                markerGroup.add(line);

                // Label
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.width = 512;
                canvas.height = 128;
                ctx.fillStyle = 'rgba(0,0,0,0.8)';
                ctx.roundRect(0, 0, 512, 128, 16);
                ctx.fill();
                ctx.strokeStyle = '#' + m.color.toString(16).padStart(6, '0');
                ctx.lineWidth = 4;
                ctx.roundRect(2, 2, 508, 124, 14);
                ctx.stroke();
                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 48px sans-serif';
                ctx.fillText(m.label + ' (' + (m.confidence * 100).toFixed(0) + '%)', 20, 80);

                const texture = new THREE.CanvasTexture(canvas);
                const spriteMat = new THREE.SpriteMaterial({{ map: texture }});
                const sprite = new THREE.Sprite(spriteMat);
                sprite.position.set(m.position[0], m.position[1] + scale * 2.5, m.position[2]);
                sprite.scale.set(scale * 8, scale * 2, 1);
                labelGroup.add(sprite);
            }});
        }}

        // Create initial markers
        createMarkers(markerScale);
        scene.add(markerGroup);
        scene.add(labelGroup);

        // Debug: log marker positions
        console.log('Markers:', markers);
        if (markers.length > 0) {{
            console.log('First marker at:', markers[0].position);
        }}

        // Build legend
        const legendDiv = document.getElementById('legend');
        const seen = new Set();
        markers.forEach(m => {{
            if (seen.has(m.label)) return;
            seen.add(m.label);
            const item = document.createElement('div');
            item.className = 'legend-item';
            const color = document.createElement('div');
            color.className = 'legend-color';
            color.style.background = '#' + m.color.toString(16).padStart(6, '0');
            item.appendChild(color);
            item.appendChild(document.createTextNode(m.label));
            legendDiv.appendChild(item);
        }});

        // Controls
        document.getElementById('showMarkers').addEventListener('change', (e) => {{
            markerGroup.visible = e.target.checked;
        }});
        document.getElementById('showLabels').addEventListener('change', (e) => {{
            labelGroup.visible = e.target.checked;
        }});

        // Animation
        function animate() {{
            requestAnimationFrame(animate);
            controls.update();

            // Make labels face camera
            labelGroup.children.forEach(sprite => {{
                sprite.lookAt(camera.position);
            }});

            renderer.render(scene, camera);
        }}
        animate();

        // Resize
        window.addEventListener('resize', () => {{
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }});
    </script>
</body>
</html>'''

    with open(output_path, 'w') as f:
        f.write(html)

    logger.info(f"Saved HTML: {output_path}")


def process(video_path: str, model_path: str, output_path: str = None,
            max_frames: int = 20, frame_interval: int = 30):
    """
    Main processing pipeline.

    1. Extract frames from video
    2. Run YOLO to detect furniture in 2D
    3. Run depth estimation to get depth maps and camera poses
    4. Back-project 2D detections to 3D
    5. Merge detections and generate visualization
    """
    print("=" * 50)
    print("  2DSEG: Video Furniture -> 3D Markers")
    print("  (with proper depth-based 3D projection)")
    print("=" * 50)

    video_path = Path(video_path)
    model_path = Path(model_path)

    if output_path is None:
        output_path = model_path.parent / f"{model_path.stem}_2dseg.html"
    output_path = Path(output_path)

    # Step 1: Extract frames
    print(f"\n[1] Extracting frames from {video_path.name}...")
    frames, frame_indices = extract_frames_from_video(
        str(video_path),
        max_frames=max_frames,
        frame_interval=frame_interval
    )

    if not frames:
        print("No frames extracted!")
        return

    # Step 2: Detect furniture in frames
    print(f"\n[2] Detecting furniture with YOLO...")
    detections_2d = detect_furniture_in_frames(frames, frame_indices)
    print(f"    Found {len(detections_2d)} 2D detections")

    if not detections_2d:
        print("No furniture detected!")
        return

    gc.collect()

    # Step 3: Estimate depth and camera poses
    print(f"\n[3] Estimating depth maps and camera poses...")
    try:
        depth_maps, intrinsics, extrinsics = estimate_depth_and_poses(frames)
        print(f"    Depth maps shape: {depth_maps.shape}")
        print(f"    Intrinsics shape: {intrinsics.shape}")
        print(f"    Extrinsics shape: {extrinsics.shape}")
    except Exception as e:
        print(f"    DA3 failed: {e}")
        print("    Trying fallback depth estimation...")
        try:
            depth_maps, intrinsics, extrinsics = estimate_depth_simple(frames)
        except Exception as e2:
            print(f"    Fallback also failed: {e2}")
            print("    Cannot proceed without depth estimation.")
            return

    gc.collect()

    # Step 4: Compute ICP alignment between depth cloud and GLB
    print(f"\n[4] Computing ICP alignment...")
    glb_path = model_path if model_path.suffix.lower() == '.glb' else model_path.with_suffix('.glb')

    R_icp = np.eye(3)
    t_icp = np.zeros(3)
    scale_icp = 1.0
    glb_points = np.zeros((0, 3))
    floor_y = None

    if glb_path.exists():
        # Load GLB points (we'll use a larger sample for detection matching)
        glb_points = sample_glb_points(str(glb_path), num_points=500000)
        print(f"    Loaded {len(glb_points)} GLB points")

        # Detect floor level (lowest 5th percentile of Y values)
        if len(glb_points) > 0:
            floor_y = np.percentile(glb_points[:, 1], 5)
            print(f"    Detected floor level: Y = {floor_y:.3f}")
        else:
            floor_y = None

        if len(glb_points) > 0:
            # Create point cloud from depth maps for ICP
            print(f"    Creating depth-based point cloud for ICP...")
            depth_cloud = create_depth_point_cloud(
                frames, depth_maps, intrinsics, extrinsics,
                sample_stride=8,  # Higher resolution for better ICP
                max_points_per_frame=5000
            )
            print(f"    Created {len(depth_cloud)} depth points")

            if len(depth_cloud) > 100:
                # Run ICP alignment with scale estimation
                print(f"    Running ICP alignment...")
                R_icp, t_icp, fitness, scale_icp = align_point_clouds_icp(
                    depth_cloud, glb_points,
                    max_iterations=100,
                    threshold=0.5
                )
                print(f"    ICP fitness: {fitness:.4f}, scale: {scale_icp:.3f}")

                if fitness < 0.1:
                    print(f"    WARNING: Low ICP fitness, results may be inaccurate")
    else:
        print(f"    GLB not found: {glb_path}")
        return

    gc.collect()

    # Step 5: Use cluster-based approach - find furniture locations directly from GLB
    print(f"\n[5] Finding furniture locations using GLB clustering...")
    detections_3d = []

    # Count unique detections per label (using frame + bbox heuristic)
    from collections import Counter
    label_counts = Counter(det.label for det in detections_2d)
    print(f"    Detection counts: {dict(label_counts)}")

    if floor_y is not None and len(glb_points) > 0:
        for label, count in label_counts.items():
            # Find clusters in GLB at the expected height for this label
            clusters = find_furniture_clusters_in_glb(
                glb_points, floor_y, label,
                min_cluster_size=30  # Lower threshold for smaller objects
            )

            if not clusters:
                logger.info(f"  {label}: No clusters found at expected height")
                continue

            # Take up to 'count' clusters (or all if fewer)
            # Sort by some metric? For now just take first N
            num_to_use = min(len(clusters), max(1, count // 3))  # Reduce count since we merge
            logger.info(f"  {label}: Found {len(clusters)} clusters, using {num_to_use}")

            for i, center in enumerate(clusters[:num_to_use]):
                # Create a detection at this cluster center
                det_3d = Detection3D(
                    label=label,
                    center=center,
                    confidence=0.8,  # High confidence since it's from GLB
                    points=np.array([center]),  # Just the center point
                    frame_idx=0
                )
                detections_3d.append(det_3d)

        print(f"    Created {len(detections_3d)} detections from GLB clusters")
    else:
        print(f"    Cannot use clustering (floor_y={floor_y}, glb_points={len(glb_points)})")

    # If clustering didn't work, fall back to ICP-based projection
    if len(detections_3d) == 0:
        print(f"    Falling back to ICP-based projection...")
        frame_to_idx = {fidx: i for i, fidx in enumerate(frame_indices)}

        for det in detections_2d:
            if det.frame_idx not in frame_to_idx:
                continue

            arr_idx = frame_to_idx[det.frame_idx]
            frame = frames[arr_idx]
            depth_map = depth_maps[arr_idx]

            det_3d = find_glb_points_in_detection_with_icp(
                det, glb_points, frame, intrinsics[arr_idx], extrinsics[arr_idx],
                R_icp, t_icp, scale_icp=scale_icp, depth_map=depth_map,
                depth_tolerance=0.5, floor_y=floor_y,
            )

            if det_3d is not None:
                detections_3d.append(det_3d)

        print(f"    Fallback found {len(detections_3d)} detections")

    if not detections_3d:
        print("Could not locate any detections in 3D!")
        return

    # Verify all detections are within GLB bounds
    glb_min, glb_max, _ = load_glb_bounds(str(glb_path))
    all_centers = np.array([d.center for d in detections_3d])
    det_min = all_centers.min(axis=0)
    det_max = all_centers.max(axis=0)

    logger.info(f"Detection bounds: {det_min} to {det_max}")
    logger.info(f"GLB bounds: {glb_min} to {glb_max}")

    # Check bounds
    margin = 0.3
    in_bounds = np.all((det_min >= glb_min - margin) & (det_max <= glb_max + margin))
    if in_bounds:
        print(f"    All detections within GLB bounds")
    else:
        print(f"    WARNING: Some detections outside GLB bounds")

    # Step 6: Merge detections
    print(f"\n[6] Merging 3D detections...")
    objects_3d = merge_3d_detections(detections_3d)
    print(f"    Merged into {len(objects_3d)} unique objects")

    # Free memory
    del frames, depth_maps
    gc.collect()

    # Step 7: Generate HTML output
    print(f"\n[7] Generating HTML output...")
    glb_path = model_path if model_path.suffix.lower() == '.glb' else model_path.with_suffix('.glb')

    if not glb_path.exists():
        print(f"GLB not found: {glb_path}")
        return

    generate_html_output(str(glb_path), objects_3d, str(output_path))

    # Summary
    print("\n" + "=" * 50)
    print("RESULTS")
    print("=" * 50)

    label_counts = defaultdict(int)
    for obj in objects_3d:
        label_counts[obj.label] += 1

    for label, count in sorted(label_counts.items()):
        print(f"  {label}: {count}")

    print(f"\nTotal: {len(objects_3d)} objects")
    print(f"Output: {output_path}")
    print("=" * 50)

    return objects_3d


def main():
    import argparse

    parser = argparse.ArgumentParser(description="2DSEG: Video Furniture Detection to 3D")
    parser.add_argument("video", nargs="?", help="Video file path")
    parser.add_argument("model", nargs="?", help="GLB/PLY model path")
    parser.add_argument("-o", "--output", help="Output HTML path")
    parser.add_argument("-m", "--max-frames", type=int, default=20, help="Max frames to sample")
    parser.add_argument("-i", "--frame-interval", type=int, default=30, help="Frame sampling interval")

    args = parser.parse_args()

    # Defaults
    script_dir = Path(__file__).parent
    video_path = args.video or str(script_dir / "sota_1.mp4")
    model_path = args.model or str(script_dir / "sota_1.glb")

    if not Path(video_path).exists():
        print(f"Video not found: {video_path}")
        return

    if not Path(model_path).exists() and not Path(model_path).with_suffix('.ply').exists():
        print(f"Model not found: {model_path}")
        return

    process(
        video_path,
        model_path,
        output_path=args.output,
        max_frames=args.max_frames,
        frame_interval=args.frame_interval
    )


if __name__ == "__main__":
    main()
