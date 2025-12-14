"""
Shared visualization utilities for 3D segmentation.

Creates interactive HTML viewers with:
- GLB model display with bounding boxes
- Point cloud visualization
- Legend, tooltips, and controls
"""

import json
import base64
from pathlib import Path
from dataclasses import dataclass
import numpy as np

try:
    import open3d as o3d
    HAS_OPEN3D = True
except ImportError:
    HAS_OPEN3D = False


@dataclass
class SegmentedObject:
    """Represents a segmented object in 3D space."""
    label: str
    points: np.ndarray
    color: list
    bbox_size: np.ndarray
    center: np.ndarray
    confidence: float


# Colors for visualization (RGB 0-1)
COLORS = {
    # Structure
    "floor": [0.6, 0.4, 0.2],
    "wall": [0.85, 0.85, 0.85],
    "ceiling": [0.95, 0.95, 0.95],
    # Seating
    "chair": [1.0, 0.2, 0.2],       # Red
    "sofa": [0.2, 0.8, 0.2],        # Green
    # Tables
    "table": [1.0, 0.6, 0.0],       # Orange
    "desk": [0.0, 0.7, 0.7],        # Cyan
    # Bedroom
    "bed": [0.3, 0.5, 0.9],         # Blue
    # Storage
    "cabinet": [0.9, 0.7, 0.5],     # Tan
    "bookshelf": [0.6, 0.2, 0.6],   # Purple
    # Lighting
    "lamp": [1.0, 1.0, 0.3],        # Yellow
    # Decor
    "plant": [0.1, 0.6, 0.1],       # Dark green
    "vase": [0.95, 0.5, 0.8],       # Pink
    "painting": [0.9, 0.3, 0.5],    # Rose
    "mirror": [0.7, 0.9, 1.0],      # Light blue
    "clock": [0.8, 0.6, 0.2],       # Gold
    # Textiles
    "rug": [0.8, 0.4, 0.4],         # Salmon
    "curtain": [0.7, 0.5, 0.7],     # Lavender
    # Electronics
    "tv": [0.2, 0.2, 0.3],          # Dark gray
    "monitor": [0.3, 0.3, 0.4],     # Gray
    "speaker": [0.4, 0.3, 0.5],     # Dark purple
    # Fixtures
    "door": [0.5, 0.3, 0.1],        # Brown
    "window": [0.4, 0.8, 1.0],      # Sky blue
    "radiator": [0.7, 0.7, 0.7],    # Silver
    "fireplace": [0.8, 0.4, 0.2],   # Brick
    # Other
    "box": [0.6, 0.5, 0.4],         # Cardboard
}


def get_color(label: str) -> list:
    """Get color for a label, with fallback."""
    return COLORS.get(label, [0.5, 0.5, 0.5])


def save_html_viewer_glb(glb_path: str, segmentation_data: list[SegmentedObject],
                         output_path: str, title: str = "3D Room Segmentation"):
    """
    Save interactive HTML viewer with original GLB model + bounding box outlines.
    Shows original model with colored bounding boxes around detected objects.
    Hover over boxes to see class labels.

    Note: PLY uses Z-up coordinates (for compatibility with seg3.py), while
    GLB/Three.js uses Y-up. Bounding boxes are transformed from Z-up to Y-up.
    """
    # Build bounding boxes for each detected object (skip structural elements)
    bboxes = []
    for obj in segmentation_data:
        if obj.label in ["floor", "ceiling", "wall"]:
            continue

        pts = obj.points
        min_pt = pts.min(axis=0)
        max_pt = pts.max(axis=0)
        center = (min_pt + max_pt) / 2
        size = max_pt - min_pt

        # Transform from Z-up (PLY) to Y-up (Three.js/GLB)
        # PLY: (x, y, z) where z is up -> Three.js: (x, z, -y)
        # Convert to Python floats for JSON serialization
        center_yup = [float(center[0]), float(center[2]), float(-center[1])]
        size_yup = [float(size[0]), float(size[2]), float(size[1])]  # Swap height dimensions

        # Ensure color is a list of Python floats
        color = obj.color
        if hasattr(color, 'tolist'):
            color = color.tolist()
        color = [float(c) for c in color]

        bboxes.append({
            "label": obj.label,
            "center": center_yup,
            "size": size_yup,
            "color": color,
            "confidence": float(obj.confidence),
            "points": int(len(pts))
        })

    # Read GLB file as base64
    with open(glb_path, 'rb') as f:
        glb_base64 = base64.b64encode(f.read()).decode('utf-8')

    # Legend items with hex colors
    legend_items = [
        ("Chair", "#ff3333", "chair"),
        ("Sofa", "#33cc33", "sofa"),
        ("Table", "#ff9900", "table"),
        ("Desk", "#00b3b3", "desk"),
        ("Bed", "#4d80e6", "bed"),
        ("Cabinet", "#e6b380", "cabinet"),
        ("Bookshelf", "#993399", "bookshelf"),
        ("Lamp", "#ffff4d", "lamp"),
        ("Plant", "#1a991a", "plant"),
        ("Vase", "#f280cc", "vase"),
        ("Painting", "#e64d80", "painting"),
        ("Mirror", "#b3e6ff", "mirror"),
        ("Clock", "#cc9933", "clock"),
        ("Rug", "#cc6666", "rug"),
        ("Curtain", "#b380b3", "curtain"),
        ("TV", "#333344", "tv"),
        ("Laptop", "#4d4d66", "laptop"),
        ("Monitor", "#4d4d66", "monitor"),
        ("Speaker", "#664d80", "speaker"),
        ("Door", "#804d1a", "door"),
        ("Window", "#66ccff", "window"),
        ("Radiator", "#b3b3b3", "radiator"),
        ("Fireplace", "#cc6633", "fireplace"),
        ("Box", "#998066", "box"),
    ]

    # Only include detected items in legend
    detected_labels = set(b["label"] for b in bboxes)
    legend_html = ""
    for name, color, label in legend_items:
        if label in detected_labels:
            count = sum(1 for b in bboxes if b["label"] == label)
            legend_html += f'<div class="leg"><div class="col" style="background:{color}"></div>{name} ({count})</div>\n'

    if not legend_html:
        legend_html = '<div class="leg" style="color:#888">No objects detected</div>'

    html = '''<!DOCTYPE html>
<html>
<head>
    <title>''' + title + '''</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { overflow: hidden; font-family: 'Segoe UI', Arial, sans-serif; background: #0a0a0f; cursor: grab; }
        body:active { cursor: grabbing; }

        #info {
            position: absolute; top: 20px; left: 20px;
            color: #fff; background: linear-gradient(135deg, rgba(20,20,30,0.95), rgba(30,30,45,0.9));
            padding: 20px; border-radius: 12px; min-width: 220px;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
            pointer-events: none;
        }
        #info h2 { margin-bottom: 10px; font-size: 18px; color: #7dd3fc; }
        #info p { font-size: 13px; color: #aaa; margin: 5px 0; }

        #legend {
            position: absolute; top: 20px; right: 20px;
            color: #fff; background: linear-gradient(135deg, rgba(20,20,30,0.95), rgba(30,30,45,0.9));
            padding: 20px; border-radius: 12px; max-height: 80vh; overflow-y: auto;
            border: 1px solid rgba(255,255,255,0.1);
            box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        }
        #legend h3 { margin-bottom: 15px; font-size: 14px; color: #7dd3fc; }
        .leg { display: flex; align-items: center; margin: 8px 0; font-size: 13px; }
        .col { width: 20px; height: 20px; margin-right: 10px; border-radius: 4px; border: 2px solid rgba(255,255,255,0.3); }

        #tooltip {
            position: fixed; padding: 12px 18px; border-radius: 8px;
            background: linear-gradient(135deg, rgba(0,0,0,0.9), rgba(20,20,40,0.95));
            color: #fff; font-size: 14px; pointer-events: none;
            display: none; z-index: 1000;
            border: 1px solid rgba(255,255,255,0.2);
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
        }
        #tooltip .label { font-weight: bold; font-size: 16px; margin-bottom: 4px; }
        #tooltip .details { color: #aaa; font-size: 12px; }

        #controls {
            position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
            color: #fff; background: rgba(20,20,30,0.9); padding: 12px 20px;
            border-radius: 25px; font-size: 12px;
            border: 1px solid rgba(255,255,255,0.1);
        }
        #controls span { margin: 0 12px; color: #666; }
        #controls b { color: #7dd3fc; }

        #toggle-boxes {
            position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            color: #fff; border: none; padding: 10px 20px;
            border-radius: 20px; cursor: pointer; font-size: 13px;
            box-shadow: 0 4px 15px rgba(59,130,246,0.4);
        }
        #toggle-boxes:hover { filter: brightness(1.1); }

        #loading {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: #0a0a0f; display: flex; align-items: center; justify-content: center;
            flex-direction: column; z-index: 1000;
        }
        #loading h2 { color: #7dd3fc; margin-bottom: 20px; }
        .spinner { width: 50px; height: 50px; border: 3px solid #333;
            border-top-color: #7dd3fc; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div id="loading">
        <div class="spinner"></div>
        <h2>Loading 3D Model...</h2>
    </div>

    <div id="info">
        <h2>''' + title + '''</h2>
        <p>Hover over colored boxes to see detected objects</p>
        <p id="stats"></p>
    </div>

    <div id="legend">
        <h3>Detected Objects</h3>
        ''' + legend_html + '''
    </div>

    <div id="tooltip">
        <div class="label"></div>
        <div class="details"></div>
    </div>

    <button id="toggle-boxes">Hide Bounding Boxes</button>

    <div id="controls">
        <b>Left-drag</b><span>Rotate</span>
        <b>Right-drag</b><span>Pan</span>
        <b>Scroll</b><span>Zoom</span>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/lines/LineSegmentsGeometry.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/lines/LineGeometry.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/lines/LineMaterial.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/lines/LineSegments2.js"></script>
    <script>
        const bboxes = ''' + json.dumps(bboxes) + ''';

        const labelColors = {
            chair: 0xff3333, sofa: 0x33cc33,
            table: 0xff9900, desk: 0x00b3b3,
            bed: 0x4d80e6,
            cabinet: 0xe6b380, bookshelf: 0x993399,
            lamp: 0xffff4d,
            plant: 0x1a991a, vase: 0xf280cc, painting: 0xe64d80,
            mirror: 0xb3e6ff, clock: 0xcc9933,
            rug: 0xcc6666, curtain: 0xb380b3,
            tv: 0x333344, monitor: 0x4d4d66, speaker: 0x664d80,
            door: 0x804d1a, window: 0x66ccff, radiator: 0xb3b3b3, fireplace: 0xcc6633,
            box: 0x998066
        };

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x12121a);

        const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1000);

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(innerWidth, innerHeight);
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.outputEncoding = THREE.sRGBEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.0;
        document.body.appendChild(renderer.domElement);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;

        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
        dirLight.position.set(5, 10, 5);
        scene.add(dirLight);
        const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
        dirLight2.position.set(-5, 5, -5);
        scene.add(dirLight2);

        let boxesVisible = true;
        let boxGroup = new THREE.Group();
        let boxMeshes = [];

        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();
        const tooltip = document.getElementById('tooltip');

        const glbBase64 = "''' + glb_base64 + '''";
        const glbBinary = Uint8Array.from(atob(glbBase64), c => c.charCodeAt(0));
        const glbUrl = URL.createObjectURL(new Blob([glbBinary], { type: 'model/gltf-binary' }));

        new THREE.GLTFLoader().load(glbUrl, (gltf) => {
            const model = gltf.scene;
            const modelBox = new THREE.Box3().setFromObject(model);
            const modelSize = modelBox.getSize(new THREE.Vector3());
            const modelCenter = modelBox.getCenter(new THREE.Vector3());
            const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
            const scale = 5 / maxDim;

            const mainGroup = new THREE.Group();
            mainGroup.add(model);

            function createThickBox(sx, sy, sz, color, lineWidth = 4) {
                const hx = sx / 2, hy = sy / 2, hz = sz / 2;
                const positions = [
                    -hx, -hy, -hz,  hx, -hy, -hz,
                    hx, -hy, -hz,   hx, -hy,  hz,
                    hx, -hy,  hz,  -hx, -hy,  hz,
                    -hx, -hy,  hz, -hx, -hy, -hz,
                    -hx,  hy, -hz,  hx,  hy, -hz,
                    hx,  hy, -hz,   hx,  hy,  hz,
                    hx,  hy,  hz,  -hx,  hy,  hz,
                    -hx,  hy,  hz, -hx,  hy, -hz,
                    -hx, -hy, -hz, -hx,  hy, -hz,
                    hx, -hy, -hz,   hx,  hy, -hz,
                    hx, -hy,  hz,   hx,  hy,  hz,
                    -hx, -hy,  hz, -hx,  hy,  hz,
                ];
                const geometry = new THREE.LineSegmentsGeometry();
                geometry.setPositions(positions);
                const material = new THREE.LineMaterial({
                    color: color,
                    linewidth: lineWidth,
                    resolution: new THREE.Vector2(window.innerWidth, window.innerHeight),
                    dashed: false
                });
                return new THREE.LineSegments2(geometry, material);
            }

            bboxes.forEach((bbox, idx) => {
                const color = labelColors[bbox.label] || 0x808080;
                // Use coordinates directly (GLB and PLY have same coord system)
                const cx = bbox.center[0];
                const cy = bbox.center[1];
                const cz = bbox.center[2];
                const sx = bbox.size[0];
                const sy = bbox.size[1];
                const sz = bbox.size[2];

                const line = createThickBox(sx, sy, sz, color, 4);
                line.position.set(cx, cy, cz);
                line.userData = { ...bbox, index: idx };
                boxGroup.add(line);
                boxMeshes.push(line);

                const fillGeometry = new THREE.BoxGeometry(sx, sy, sz);
                const fill = new THREE.Mesh(
                    fillGeometry,
                    new THREE.MeshBasicMaterial({
                        color: color, transparent: true, opacity: 0.2, side: THREE.DoubleSide
                    })
                );
                fill.position.set(cx, cy, cz);
                fill.userData = { ...bbox, index: idx, isFill: true };
                boxGroup.add(fill);
                boxMeshes.push(fill);
            });

            mainGroup.add(boxGroup);
            mainGroup.position.x = -modelCenter.x;
            mainGroup.position.y = -modelCenter.y;
            mainGroup.position.z = -modelCenter.z;
            mainGroup.scale.setScalar(scale);

            const scaledMinY = (modelBox.min.y - modelCenter.y) * scale;
            mainGroup.position.y -= scaledMinY;

            scene.add(mainGroup);

            const grid = new THREE.GridHelper(15, 30, 0x444455, 0x333344);
            scene.add(grid);

            camera.position.set(4, 3, 6);
            controls.target.set(0, modelSize.y * scale / 2, 0);
            controls.update();

            document.getElementById('stats').textContent = `Objects: ${bboxes.length}`;
            document.getElementById('loading').style.display = 'none';
            URL.revokeObjectURL(glbUrl);
        });

        document.getElementById('toggle-boxes').onclick = () => {
            boxesVisible = !boxesVisible;
            boxGroup.visible = boxesVisible;
            document.getElementById('toggle-boxes').textContent =
                boxesVisible ? 'Hide Bounding Boxes' : 'Show Bounding Boxes';
        };

        document.addEventListener('mousemove', (e) => {
            mouse.x = (e.clientX / innerWidth) * 2 - 1;
            mouse.y = -(e.clientY / innerHeight) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(boxMeshes);

            if (intersects.length > 0 && boxesVisible) {
                const obj = intersects[0].object;
                const data = obj.userData;
                if (data.label) {
                    tooltip.style.display = 'block';
                    tooltip.style.left = (e.clientX + 15) + 'px';
                    tooltip.style.top = (e.clientY + 15) + 'px';
                    tooltip.querySelector('.label').textContent = data.label.toUpperCase();
                    tooltip.querySelector('.label').style.color = '#' + (labelColors[data.label] || 0x808080).toString(16).padStart(6, '0');
                    tooltip.querySelector('.details').textContent =
                        `Size: ${data.size[0].toFixed(2)} x ${data.size[1].toFixed(2)} x ${data.size[2].toFixed(2)}m | Conf: ${(data.confidence * 100).toFixed(0)}%`;
                    document.body.style.cursor = 'pointer';
                }
            } else {
                tooltip.style.display = 'none';
                document.body.style.cursor = 'grab';
            }
        });

        (function animate() {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        })();

        addEventListener('resize', () => {
            camera.aspect = innerWidth / innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(innerWidth, innerHeight);
            boxMeshes.forEach(mesh => {
                if (mesh.material && mesh.material.resolution) {
                    mesh.material.resolution.set(innerWidth, innerHeight);
                }
            });
        });
    </script>
</body>
</html>'''

    with open(output_path, 'w') as f:
        f.write(html)
    print(f"HTML viewer saved: {output_path}")


def save_html_viewer_points(pcd, output_path: str, title: str = "3D Point Cloud"):
    """Fallback: save simple point cloud HTML viewer."""
    points = np.asarray(pcd.points)
    colors = np.asarray(pcd.colors) if pcd.has_colors() else np.ones((len(points), 3)) * 0.5

    max_points = 100000
    if len(points) > max_points:
        idx = np.random.choice(len(points), max_points, replace=False)
        points, colors = points[idx], colors[idx]

    center = points.mean(axis=0)
    points = points - center

    html = '''<!DOCTYPE html>
<html><head><title>''' + title + '''</title>
<style>body{margin:0;overflow:hidden}#legend{position:absolute;top:10px;right:10px;color:#fff;background:rgba(0,0,0,.8);padding:15px;border-radius:8px;font:13px Arial}</style>
</head><body>
<div id="legend"><b>Legend</b><br>
<span style="color:#964B00">&#9632;</span> Floor<br>
<span style="color:#d9d9d9">&#9632;</span> Wall<br>
<span style="color:#ff3333">&#9632;</span> Chair<br>
<span style="color:#ff9900">&#9632;</span> Table<br>
<span style="color:#33cc33">&#9632;</span> Sofa<br>
<span style="color:#4d80e6">&#9632;</span> Bed<br>
<span style="color:#808080">&#9632;</span> Other</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"></script>
<script>
const pts=''' + json.dumps(points.tolist()) + ''';
const cols=''' + json.dumps((colors * 255).astype(int).tolist()) + ''';
const scene=new THREE.Scene();scene.background=new THREE.Color(0x1a1a2e);
const cam=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.1,1000);cam.position.set(5,5,5);
const ren=new THREE.WebGLRenderer({antialias:1});ren.setSize(innerWidth,innerHeight);document.body.appendChild(ren.domElement);
const ctrl=new THREE.OrbitControls(cam,ren.domElement);ctrl.enableDamping=1;
const geo=new THREE.BufferGeometry();
const pos=new Float32Array(pts.length*3),col=new Float32Array(pts.length*3);
for(let i=0;i<pts.length;i++){pos[i*3]=pts[i][0];pos[i*3+1]=pts[i][2];pos[i*3+2]=-pts[i][1];
col[i*3]=cols[i][0]/255;col[i*3+1]=cols[i][1]/255;col[i*3+2]=cols[i][2]/255;}
geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
geo.setAttribute('color',new THREE.BufferAttribute(col,3));
scene.add(new THREE.Points(geo,new THREE.PointsMaterial({size:.02,vertexColors:1})));
scene.add(new THREE.GridHelper(10,20,0x444,0x222));
(function a(){requestAnimationFrame(a);ctrl.update();ren.render(scene,cam)})();
addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix();ren.setSize(innerWidth,innerHeight)});
</script></body></html>'''

    with open(output_path, 'w') as f:
        f.write(html)
    print(f"HTML viewer saved: {output_path}")


def print_results(objects: list[SegmentedObject]):
    """Print segmentation summary."""
    print("\n" + "=" * 50)
    print("SEGMENTATION RESULTS")
    print("=" * 50)

    counts = {}
    for o in objects:
        counts[o.label] = counts.get(o.label, 0) + 1

    structure_labels = ["floor", "ceiling", "wall"]
    movable_labels = [
        "chair", "sofa", "table", "desk", "bed",
        "cabinet", "bookshelf", "lamp",
        "plant", "vase", "painting", "mirror", "clock",
        "rug", "curtain", "tv", "monitor", "speaker",
        "door", "window", "radiator", "fireplace", "box"
    ]

    print("\nStructure:")
    for label in structure_labels:
        if label in counts:
            print(f"  {label:12s}: {counts[label]}")

    print("\nMovable Objects:")
    for label in movable_labels:
        if label in counts:
            print(f"  {label:12s}: {counts[label]}")

    movable_objects = [o for o in objects if o.label in movable_labels]

    print(f"\nTotal: {len(movable_objects)} movable items detected")
    for f in movable_objects:
        print(f"  - {f.label}: {f.bbox_size[0]:.2f} x {f.bbox_size[1]:.2f} x {f.bbox_size[2]:.2f}m ({f.confidence:.0%})")

    print("=" * 50)
