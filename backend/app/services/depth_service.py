import torch
import numpy as np
import base64
import asyncio
from typing import Callable, Optional
from pathlib import Path
import logging

from ..models.schemas import ProgressUpdate, DepthFrame, CameraParameters, ModelAsset, ProcessingResult
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

    @staticmethod
    def _as_homogeneous44(ext: np.ndarray) -> np.ndarray:
        """Accept (4,4) or (3,4) extrinsic parameters, return (4,4) homogeneous matrix."""
        if ext.shape == (4, 4):
            return ext
        if ext.shape == (3, 4):
            H = np.eye(4, dtype=ext.dtype)
            H[:3, :4] = ext
            return H
        raise ValueError(f"extrinsic must be (4,4) or (3,4), got {ext.shape}")

    def _export_tsdf_mesh_glb_sync(self, prediction, out_path: Path) -> None:
        """
        Fuse multi-view depth into a single TSDF mesh and export to GLB.

        Notes:
        - Uses DA3's predicted intrinsics/extrinsics (world-to-camera) and processed_images.
        - Output is a single, unified triangle mesh (not per-frame point clouds).
        """
        try:
            import open3d as o3d
        except ImportError as e:
            raise RuntimeError("open3d is required for mesh reconstruction (installed via Depth-Anything-3).") from e

        depth = getattr(prediction, "depth", None)
        intrinsics = getattr(prediction, "intrinsics", None)
        extrinsics = getattr(prediction, "extrinsics", None)
        images = getattr(prediction, "processed_images", None)

        if depth is None or intrinsics is None or extrinsics is None:
            raise RuntimeError("DA3 prediction missing depth/intrinsics/extrinsics; cannot reconstruct mesh.")
        if images is None:
            raise RuntimeError("DA3 prediction missing processed_images; cannot reconstruct colored mesh.")

        if depth.ndim != 3:
            raise ValueError(f"Expected depth with shape (N,H,W), got {depth.shape}")
        N, H, W = depth.shape

        # Use intrinsics from the first view (DA3 returns (N,3,3); typically identical across views)
        K0 = np.asarray(intrinsics[0], dtype=np.float64)
        fx, fy = float(K0[0, 0]), float(K0[1, 1])
        cx, cy = float(K0[0, 2]), float(K0[1, 2])
        intrinsic_o3d = o3d.camera.PinholeCameraIntrinsic(W, H, fx, fy, cx, cy)

        # Heuristic TSDF parameters based on predicted depth distribution (units may be arbitrary but consistent)
        d0 = np.asarray(depth[0], dtype=np.float32)
        valid0 = np.isfinite(d0) & (d0 > 0)
        if valid0.any():
            median_depth = float(np.median(d0[valid0]))
            p95_depth = float(np.percentile(d0[valid0], 95))
        else:
            median_depth, p95_depth = 1.0, 3.0

        voxel_length = float(np.clip(median_depth / 200.0, 0.002, 0.05))
        sdf_trunc = voxel_length * 5.0
        depth_trunc = float(max(p95_depth, median_depth * 1.5))

        volume = o3d.pipelines.integration.ScalableTSDFVolume(
            voxel_length=voxel_length,
            sdf_trunc=sdf_trunc,
            color_type=o3d.pipelines.integration.TSDFVolumeColorType.RGB8,
        )

        for i in range(N):
            color_np = np.asarray(images[i], dtype=np.uint8)
            depth_np = np.asarray(depth[i], dtype=np.float32)

            if color_np.shape[:2] != (H, W):
                # Safety: keep depth+color aligned
                raise ValueError(f"processed_images size mismatch for view {i}: {color_np.shape} vs depth {(H, W)}")

            color_o3d = o3d.geometry.Image(color_np)
            depth_o3d = o3d.geometry.Image(depth_np)
            rgbd = o3d.geometry.RGBDImage.create_from_color_and_depth(
                color_o3d,
                depth_o3d,
                depth_scale=1.0,
                depth_trunc=depth_trunc,
                convert_rgb_to_intensity=False,
            )

            ext_w2c = self._as_homogeneous44(np.asarray(extrinsics[i], dtype=np.float64))
            volume.integrate(rgbd, intrinsic_o3d, ext_w2c)

        mesh = volume.extract_triangle_mesh()
        if len(mesh.vertices) == 0 or len(mesh.triangles) == 0:
            raise RuntimeError("TSDF reconstruction produced an empty mesh.")

        # Basic cleanup + normals for nicer shading
        mesh.remove_degenerate_triangles()
        mesh.remove_duplicated_triangles()
        mesh.remove_duplicated_vertices()
        mesh.remove_non_manifold_edges()
        mesh.compute_vertex_normals()

        # Decimate to keep browser-friendly file sizes
        target_tris = 200_000
        if len(mesh.triangles) > target_tris:
            mesh = mesh.simplify_quadric_decimation(target_tris)
            mesh.remove_degenerate_triangles()
            mesh.remove_duplicated_triangles()
            mesh.remove_duplicated_vertices()
            mesh.remove_non_manifold_edges()
            mesh.compute_vertex_normals()

        out_path.parent.mkdir(parents=True, exist_ok=True)

        # Prefer Open3D native writer (supports glTF/glb on recent versions); fall back to trimesh if needed.
        try:
            o3d.io.write_triangle_mesh(str(out_path), mesh, write_vertex_colors=True)
        except Exception:
            try:
                import trimesh
            except ImportError as e:
                raise RuntimeError("Failed to export mesh via Open3D and trimesh is unavailable.") from e

            verts = np.asarray(mesh.vertices)
            faces = np.asarray(mesh.triangles)
            vcols = np.asarray(mesh.vertex_colors) if len(mesh.vertex_colors) else None
            if vcols is not None and vcols.size:
                vcols_u8 = np.clip(vcols * 255.0, 0, 255).astype(np.uint8)
            else:
                vcols_u8 = None

            tm = trimesh.Trimesh(vertices=verts, faces=faces, vertex_colors=vcols_u8, process=False)
            tm.export(str(out_path))

    async def _export_room_mesh_asset(self, prediction, job_id: str) -> ModelAsset:
        """Export a unified room mesh for this job and return a ModelAsset descriptor."""
        job_dir = settings.temp_dir / job_id
        out_filename = "room.glb"
        out_path = job_dir / out_filename
        await asyncio.to_thread(self._export_tsdf_mesh_glb_sync, prediction, out_path)
        return ModelAsset(
            filename=out_filename,
            url=f"/api/assets/{job_id}/{out_filename}",
            format="glb",
        )

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

        # Run inference with maximum quality settings
        try:
            # Prepare export directory
            job_dir = settings.temp_dir / job_id
            job_dir.mkdir(parents=True, exist_ok=True)

            logger.info(f"Running DA3 inference with: model={settings.model_name}, "
                       f"process_res={settings.process_resolution}, "
                       f"use_ray_pose={settings.use_ray_pose}, "
                       f"infer_gs={settings.enable_gaussian_splatting}")

            # Use DA3's native export for best quality
            prediction = self._model.inference(
                frames,
                process_res=settings.process_resolution,
                # Enable Gaussian Splatting for photorealistic output
                infer_gs=settings.enable_gaussian_splatting,
                # Use ray-based pose estimation for 44% better accuracy
                use_ray_pose=settings.use_ray_pose,
                # Reference view strategy for multi-view consistency
                ref_view_strategy="saddle_balanced",
                # Export settings - let DA3 handle the GLB generation natively
                export_dir=str(job_dir),
                export_format=settings.export_format,
                # GLB quality parameters
                conf_thresh_percentile=settings.conf_thresh_percentile,
                num_max_points=settings.num_max_points,
                show_cameras=settings.show_cameras,
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

            # DA3 native export creates the GLB file directly during inference
            # Look for the exported file in the job directory
            model_asset: ModelAsset | None = None

            if progress_callback:
                progress_callback(ProgressUpdate(
                    stage="Exporting 3D model",
                    progress=85.0,
                    message="Processing DA3 native export..."
                ))

            # DA3 exports to {export_dir}/scene.glb (or scene.ply, etc.)
            job_dir = settings.temp_dir / job_id
            export_ext = settings.export_format.split("-")[0]  # Handle "glb-feat_vis" -> "glb"

            # Check for exported files (DA3 may use different naming)
            possible_files = [
                job_dir / f"scene.{export_ext}",
                job_dir / f"output.{export_ext}",
                job_dir / f"room.{export_ext}",
            ]

            exported_file = None
            for f in possible_files:
                if f.exists():
                    exported_file = f
                    break

            # Also check for any GLB/PLY file in the directory
            if exported_file is None:
                for ext in ["glb", "ply", "gltf"]:
                    matches = list(job_dir.glob(f"*.{ext}"))
                    if matches:
                        exported_file = matches[0]
                        break

            if exported_file and exported_file.exists():
                model_asset = ModelAsset(
                    filename=exported_file.name,
                    url=f"/api/assets/{job_id}/{exported_file.name}",
                    format=exported_file.suffix[1:],  # Remove the dot
                )
                logger.info(f"DA3 exported model: {exported_file}")
                if progress_callback:
                    progress_callback(ProgressUpdate(
                        stage="Exporting 3D model",
                        progress=92.0,
                        message=f"3D model exported ({model_asset.format})"
                    ))
            else:
                # Fallback: Try manual TSDF fusion if DA3 export didn't create a file
                logger.warning(f"DA3 native export didn't create a file, trying TSDF fallback")
                try:
                    model_asset = await self._export_room_mesh_asset(prediction, job_id)
                    if progress_callback:
                        progress_callback(ProgressUpdate(
                            stage="Exporting 3D model",
                            progress=92.0,
                            message=f"3D mesh exported via TSDF ({model_asset.format})"
                        ))
                except Exception as e:
                    logger.exception(f"Both DA3 export and TSDF fallback failed: {e}")

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
                model_asset=model_asset,
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
