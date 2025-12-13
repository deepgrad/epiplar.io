# Epipar.io Optimization & NeRFiller Integration Plan

## Overview

This plan addresses two key improvements:
1. **Performance**: Speed up large GLB rendering in browser
2. **Quality**: Integrate NeRFiller for 3D scene completion

---

## Part 1: GLB Performance Optimization

### Problem
- Current GLB files are 10-50MB with up to 10M points
- Browser rendering becomes laggy with large point clouds
- Three.js struggles with millions of points

### Solution A: Level of Detail (LOD) System

Generate multiple quality levels and stream progressively.

#### Backend Changes (`backend/app/services/depth_service.py`)

```python
async def export_multi_lod_glb(self, prediction, job_id: str) -> list[ModelAsset]:
    """Export GLB at multiple LOD levels for progressive loading."""
    lod_configs = [
        {"name": "preview", "max_points": 100_000, "conf_thresh": 20.0},
        {"name": "medium", "max_points": 1_000_000, "conf_thresh": 10.0},
        {"name": "full", "max_points": 10_000_000, "conf_thresh": 3.0},
    ]

    assets = []
    for config in lod_configs:
        # Export with different quality settings
        glb_path = await self._export_glb_with_config(prediction, job_id, config)
        assets.append(ModelAsset(
            filename=f"scene_{config['name']}.glb",
            url=f"/api/assets/{job_id}/scene_{config['name']}.glb",
            format="glb",
            lod_level=config['name'],
        ))
    return assets
```

#### Frontend Changes (`src/components/ModelViewer.tsx`)

```typescript
// Progressive LOD loading
const [currentLOD, setCurrentLOD] = useState<'preview' | 'medium' | 'full'>('preview');

useEffect(() => {
  // Load preview immediately
  loadGLB(assets.preview).then(() => {
    // Load medium in background
    loadGLB(assets.medium).then(() => {
      setCurrentLOD('medium');
      // Load full quality last
      loadGLB(assets.full).then(() => setCurrentLOD('full'));
    });
  });
}, [assets]);
```

### Solution B: GPU Instancing & Octree Culling

Use Three.js optimizations for large point clouds.

#### Implementation (`src/components/PointCloudViewer.tsx`)

```typescript
import { Octree } from 'three/examples/jsm/math/Octree';

// Use InstancedBufferGeometry for better performance
const geometry = new THREE.InstancedBufferGeometry();

// Frustum culling with octree
const octree = new Octree();
octree.fromGraphNode(pointCloud);

// Only render visible points
function updateVisiblePoints(camera: THREE.Camera) {
  const frustum = new THREE.Frustum();
  frustum.setFromProjectionMatrix(
    camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse)
  );
  // Cull points outside frustum
}
```

### Solution C: WebGPU Renderer (Future)

Three.js r150+ supports WebGPU for 10x performance.

```typescript
import { WebGPURenderer } from 'three/webgpu';

// Check WebGPU support
if (navigator.gpu) {
  const renderer = new WebGPURenderer();
  await renderer.init();
}
```

### Solution D: Draco/Meshopt Compression

Compress GLB files for faster download.

#### Backend (`backend/app/services/depth_service.py`)

```python
import trimesh

def compress_glb(input_path: Path, output_path: Path):
    """Compress GLB with Draco compression."""
    mesh = trimesh.load(input_path)
    mesh.export(
        output_path,
        file_type='glb',
        resolver=None,
        include_normals=True,
        # Enable Draco compression
        draco_compression=True,
        draco_compression_level=7,
    )
```

### Recommended Implementation Order

1. **LOD System** (highest impact, moderate effort)
2. **Draco Compression** (easy, reduces download time)
3. **Frustum Culling** (moderate effort, helps with rendering)
4. **WebGPU** (future, when browser support improves)

---

## Part 2: NeRFiller Integration

### What is NeRFiller?

[NeRFiller](https://github.com/ethanweber/nerfiller) (CVPR 2024) completes missing 3D regions using 2D inpainting diffusion models. Key insight: arranging images in 2x2 grids produces more 3D-consistent inpaints.

### Architecture

```
Current Pipeline:
  Video → Frames → DA3 → GLB Point Cloud (may have gaps)

New Pipeline:
  Video → Frames → DA3 → Point Cloud + Depth + Camera Poses
                              ↓
                    Identify incomplete regions
                              ↓
                    NeRFiller inpainting
                              ↓
                    Complete 3D scene (NeRF or GLB)
```

### Prerequisites

```bash
# Install Nerfstudio (required by NeRFiller)
pip install nerfstudio

# Clone and install NeRFiller
git clone https://github.com/ethanweber/nerfiller.git
cd nerfiller
pip install -e .
```

### Backend Implementation

#### New File: `backend/app/services/nerfiller_service.py`

```python
import subprocess
import json
from pathlib import Path
from typing import Optional
import numpy as np

from ..models.schemas import CameraParameters, ProcessingResult

class NerFillerService:
    """Service for NeRFiller 3D scene completion."""

    def __init__(self):
        self.nerfiller_path = Path("/opt/nerfiller")  # Or configurable

    async def prepare_nerfstudio_dataset(
        self,
        frames: list[np.ndarray],
        depth_maps: np.ndarray,
        camera_params: CameraParameters,
        job_dir: Path,
    ) -> Path:
        """
        Convert DA3 output to Nerfstudio dataset format.

        Nerfstudio expects:
        - images/ folder with numbered frames
        - transforms.json with camera poses
        - Optional: depth/ folder with depth maps
        """
        dataset_dir = job_dir / "nerfstudio_data"
        images_dir = dataset_dir / "images"
        depth_dir = dataset_dir / "depth"

        images_dir.mkdir(parents=True, exist_ok=True)
        depth_dir.mkdir(parents=True, exist_ok=True)

        # Save frames as images
        import cv2
        for i, frame in enumerate(frames):
            cv2.imwrite(str(images_dir / f"frame_{i:04d}.png"),
                       cv2.cvtColor(frame, cv2.COLOR_RGB2BGR))

            # Save depth maps
            np.save(depth_dir / f"frame_{i:04d}.npy", depth_maps[i])

        # Create transforms.json (Nerfstudio camera format)
        transforms = self._create_transforms_json(
            frames, camera_params, images_dir
        )

        with open(dataset_dir / "transforms.json", "w") as f:
            json.dump(transforms, f, indent=2)

        return dataset_dir

    def _create_transforms_json(
        self,
        frames: list[np.ndarray],
        camera_params: CameraParameters,
        images_dir: Path,
    ) -> dict:
        """Create Nerfstudio-compatible transforms.json."""
        h, w = frames[0].shape[:2]

        # Get intrinsics (assume same for all frames)
        K = np.array(camera_params.intrinsics[0])
        fx, fy = K[0, 0], K[1, 1]
        cx, cy = K[0, 2], K[1, 2]

        frames_data = []
        for i in range(len(frames)):
            # Convert extrinsics to Nerfstudio format (camera-to-world)
            ext = np.array(camera_params.extrinsics[i])
            if ext.shape == (3, 4):
                ext = np.vstack([ext, [0, 0, 0, 1]])

            # Invert to get camera-to-world
            c2w = np.linalg.inv(ext)

            frames_data.append({
                "file_path": f"images/frame_{i:04d}.png",
                "transform_matrix": c2w.tolist(),
            })

        return {
            "camera_model": "OPENCV",
            "fl_x": float(fx),
            "fl_y": float(fy),
            "cx": float(cx),
            "cy": float(cy),
            "w": int(w),
            "h": int(h),
            "frames": frames_data,
        }

    async def identify_incomplete_regions(
        self,
        depth_maps: np.ndarray,
        confidence_maps: Optional[np.ndarray],
    ) -> np.ndarray:
        """
        Identify regions that need inpainting.

        Returns binary mask where 1 = needs inpainting.
        """
        masks = []

        for i in range(len(depth_maps)):
            mask = np.zeros_like(depth_maps[i], dtype=np.uint8)

            # Mark low-confidence regions
            if confidence_maps is not None:
                mask[confidence_maps[i] < 0.3] = 1

            # Mark regions with invalid depth
            mask[~np.isfinite(depth_maps[i])] = 1
            mask[depth_maps[i] <= 0] = 1

            # Dilate mask to ensure smooth transitions
            import cv2
            kernel = np.ones((5, 5), np.uint8)
            mask = cv2.dilate(mask, kernel, iterations=2)

            masks.append(mask)

        return np.array(masks)

    async def run_nerfiller(
        self,
        dataset_dir: Path,
        masks: np.ndarray,
        output_dir: Path,
    ) -> Path:
        """
        Run NeRFiller inpainting on the dataset.

        NeRFiller process:
        1. Train initial NeRF on visible regions
        2. Use Joint Multi-View Inpainting on masked regions
        3. Iteratively refine with Dataset Update strategy
        """
        # Save masks
        masks_dir = dataset_dir / "masks"
        masks_dir.mkdir(exist_ok=True)
        for i, mask in enumerate(masks):
            import cv2
            cv2.imwrite(str(masks_dir / f"frame_{i:04d}.png"), mask * 255)

        # Run NeRFiller training
        # This uses Nerfstudio's training infrastructure
        cmd = [
            "ns-train", "nerfiller",
            "--data", str(dataset_dir),
            "--output-dir", str(output_dir),
            "--pipeline.model.use-masks", "True",
            "--pipeline.model.mask-dir", str(masks_dir),
            # NeRFiller-specific settings
            "--pipeline.model.inpaint-method", "joint-multiview",
            "--pipeline.model.dataset-update", "True",
            "--max-num-iterations", "30000",
        ]

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise RuntimeError(f"NeRFiller failed: {stderr.decode()}")

        return output_dir / "nerfiller" / "exports"

    async def export_completed_scene(
        self,
        nerfiller_output: Path,
        job_id: str,
    ) -> Path:
        """Export the completed NeRF scene to GLB/PLY."""
        # Use Nerfstudio's export functionality
        cmd = [
            "ns-export", "pointcloud",
            "--load-config", str(nerfiller_output / "config.yml"),
            "--output-dir", str(nerfiller_output / "export"),
            "--num-points", "5000000",
            "--remove-outliers", "True",
            "--use-bounding-box", "True",
        ]

        process = await asyncio.create_subprocess_exec(*cmd)
        await process.communicate()

        # Convert to GLB
        ply_path = nerfiller_output / "export" / "point_cloud.ply"
        glb_path = nerfiller_output / "export" / "scene_complete.glb"

        import trimesh
        cloud = trimesh.load(ply_path)
        cloud.export(glb_path)

        return glb_path


nerfiller_service = NerFillerService()
```

#### Update: `backend/app/api/routes.py`

```python
from ..services.nerfiller_service import nerfiller_service

@router.post("/inpaint/{job_id}")
async def inpaint_scene(
    job_id: str,
    background_tasks: BackgroundTasks,
):
    """Run NeRFiller to complete missing scene regions."""
    if job_id not in jobs:
        raise HTTPException(404, "Job not found")

    job = jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(400, "Job must be completed before inpainting")

    # Start inpainting in background
    background_tasks.add_task(
        run_nerfiller_task,
        job_id,
        job["result"],
    )

    return {"status": "inpainting", "job_id": job_id}

async def run_nerfiller_task(job_id: str, result: dict):
    """Background task for NeRFiller inpainting."""
    try:
        jobs[job_id]["status"] = "inpainting"

        # Prepare dataset
        job_dir = settings.temp_dir / job_id
        dataset_dir = await nerfiller_service.prepare_nerfstudio_dataset(
            frames=...,  # Load from saved frames
            depth_maps=...,  # Load from result
            camera_params=result["camera_params"],
            job_dir=job_dir,
        )

        # Identify regions to inpaint
        masks = await nerfiller_service.identify_incomplete_regions(
            depth_maps=...,
            confidence_maps=...,
        )

        # Run NeRFiller
        output_dir = job_dir / "nerfiller_output"
        nerfiller_output = await nerfiller_service.run_nerfiller(
            dataset_dir, masks, output_dir
        )

        # Export completed scene
        glb_path = await nerfiller_service.export_completed_scene(
            nerfiller_output, job_id
        )

        # Update job result
        jobs[job_id]["result"]["inpainted_model"] = {
            "filename": "scene_complete.glb",
            "url": f"/api/assets/{job_id}/nerfiller_output/export/scene_complete.glb",
            "format": "glb",
        }
        jobs[job_id]["status"] = "completed"

    except Exception as e:
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["error"] = str(e)
```

### Frontend Implementation

#### Update: `src/services/api.ts`

```typescript
export async function startInpainting(jobId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/inpaint/${jobId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Failed to start inpainting');
  }
}

export interface ProcessingResult {
  // ... existing fields
  inpainted_model?: ModelAsset;  // NEW: completed scene after NeRFiller
}
```

#### Update: `src/components/ResultsPreview.tsx`

```tsx
// Add inpainting button and status
const [isInpainting, setIsInpainting] = useState(false);

const handleInpaint = async () => {
  setIsInpainting(true);
  await startInpainting(result.job_id);
  // Poll for completion or use WebSocket
};

return (
  <div>
    {/* Existing preview */}

    {!result.inpainted_model && (
      <button onClick={handleInpaint} disabled={isInpainting}>
        {isInpainting ? 'Inpainting...' : 'Fill Missing Regions (NeRFiller)'}
      </button>
    )}

    {result.inpainted_model && (
      <div>
        <h3>Completed Scene</h3>
        <ModelViewer asset={result.inpainted_model} />
      </div>
    )}
  </div>
);
```

### Docker Setup

#### Update: `backend/Dockerfile`

```dockerfile
# Add Nerfstudio and NeRFiller
RUN pip install nerfstudio

# Clone and install NeRFiller
RUN git clone https://github.com/ethanweber/nerfiller.git /opt/nerfiller && \
    cd /opt/nerfiller && \
    pip install -e .

# Install additional dependencies
RUN pip install trimesh pyglet
```

### Configuration

#### Update: `backend/app/config.py`

```python
class Settings(BaseSettings):
    # ... existing settings

    # NeRFiller settings
    enable_nerfiller: bool = True
    nerfiller_iterations: int = 30000
    nerfiller_inpaint_method: str = "joint-multiview"  # or "individual"
    nerfiller_dataset_update: bool = True
```

---

## Implementation Timeline

### Phase 1: Performance (Week 1)
1. Implement LOD system (backend + frontend)
2. Add Draco compression
3. Test with large GLB files

### Phase 2: NeRFiller Core (Week 2)
1. Set up Nerfstudio + NeRFiller in Docker
2. Implement dataset conversion
3. Implement mask generation

### Phase 3: NeRFiller Integration (Week 3)
1. Add inpainting API endpoint
2. Implement background task
3. Add frontend UI for inpainting

### Phase 4: Polish (Week 4)
1. WebSocket progress for NeRFiller
2. Error handling and recovery
3. Documentation and testing

---

## Resources

- [NeRFiller Paper](https://arxiv.org/abs/2312.04560)
- [NeRFiller GitHub](https://github.com/ethanweber/nerfiller)
- [Nerfstudio Documentation](https://docs.nerf.studio/)
- [Three.js LOD](https://threejs.org/docs/#api/en/objects/LOD)
- [Draco Compression](https://google.github.io/draco/)

---

## Notes

- NeRFiller requires significant GPU memory (8GB+ recommended)
- Inpainting takes 10-30 minutes per scene
- Consider caching inpainted results
- WebGPU support is experimental but promising for future
