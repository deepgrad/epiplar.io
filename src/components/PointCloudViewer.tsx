import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface PointCloudViewerProps {
  positions: Float32Array;
  colors: Float32Array;
  className?: string;
}

// Create grid texture for background
const createGridTexture = () => {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Fill with very dark indigo background
  ctx.fillStyle = '#030208';
  ctx.fillRect(0, 0, size, size);

  // Set compositing to ensure no blending on overlap
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1.0;

  // Draw grid lines with very dark indigo (same color, no transparency)
  ctx.strokeStyle = '#080514';
  ctx.lineWidth = 1;
  ctx.lineCap = 'square';

  const gridSize = 8; // Number of grid cells (very sparse grid)
  const cellSize = size / gridSize;

  // Draw all grid lines with consistent color
  ctx.beginPath();
  // Vertical lines
  for (let i = 0; i <= gridSize; i++) {
    const x = Math.round(i * cellSize) + 0.5; // Add 0.5 for crisp lines
    ctx.moveTo(x, 0);
    ctx.lineTo(x, size);
  }
  // Horizontal lines
  for (let i = 0; i <= gridSize; i++) {
    const y = Math.round(i * cellSize) + 0.5; // Add 0.5 for crisp lines
    ctx.moveTo(0, y);
    ctx.lineTo(size, y);
  }
  ctx.stroke(); // Draw all lines in a single stroke to ensure consistent color

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  // Repeat will be set based on aspect ratio to maintain square cells
  return texture;
};

export default function PointCloudViewer({ positions, colors, className = '' }: PointCloudViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  const animationFrameRef = useRef<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // Create scene
    const scene = new THREE.Scene();
    const gridTexture = createGridTexture();
    if (gridTexture) {
      // Adjust texture repeat to maintain square grid cells based on aspect ratio
      const aspect = width / height;
      if (aspect > 1) {
        // Wider than tall - more repeats horizontally
        gridTexture.repeat.set(4 * aspect, 4);
      } else {
        // Taller than wide - more repeats vertically
        gridTexture.repeat.set(4, 4 / aspect);
      }
    }
    scene.background = gridTexture || new THREE.Color(0x030208); // Grid texture or fallback to very dark indigo
    sceneRef.current = scene;

    // Create camera
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 0, 5);
    cameraRef.current = camera;

    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Create controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.autoRotate = false;
    controlsRef.current = controls;

    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Animation loop
    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Handle resize
    const handleResize = () => {
      if (!container) return;
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / newHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
      
      // Update texture repeat to maintain square grid cells
      if (gridTexture && scene.background === gridTexture) {
        const aspect = newWidth / newHeight;
        if (aspect > 1) {
          gridTexture.repeat.set(4 * aspect, 4);
        } else {
          gridTexture.repeat.set(4, 4 / aspect);
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update point cloud when data changes
  useEffect(() => {
    if (!sceneRef.current || positions.length === 0) return;

    // Remove old points
    if (pointsRef.current) {
      sceneRef.current.remove(pointsRef.current);
      pointsRef.current.geometry.dispose();
      (pointsRef.current.material as THREE.Material).dispose();
    }

    // Create geometry
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Center the geometry
    geometry.computeBoundingBox();
    const boundingBox = geometry.boundingBox!;
    const center = new THREE.Vector3();
    boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);

    // Create material
    const material = new THREE.PointsMaterial({
      size: 0.02,
      vertexColors: true,
      sizeAttenuation: true,
    });

    // Create points
    const points = new THREE.Points(geometry, material);
    sceneRef.current.add(points);
    pointsRef.current = points;

    // Adjust camera to fit point cloud
    const size = new THREE.Vector3();
    boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (cameraRef.current) {
      cameraRef.current.position.set(0, 0, maxDim * 1.5);
      cameraRef.current.lookAt(0, 0, 0);
    }
    if (controlsRef.current) {
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  }, [positions, colors]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
    setIsFullscreen(!isFullscreen);
  };

  const resetCamera = () => {
    if (cameraRef.current && controlsRef.current && pointsRef.current) {
      const geometry = pointsRef.current.geometry;
      geometry.computeBoundingBox();
      const boundingBox = geometry.boundingBox!;
      const size = new THREE.Vector3();
      boundingBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z);

      cameraRef.current.position.set(0, 0, maxDim * 1.5);
      cameraRef.current.lookAt(0, 0, 0);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const toggleAutoRotate = () => {
    if (controlsRef.current) {
      controlsRef.current.autoRotate = !controlsRef.current.autoRotate;
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div
        ref={containerRef}
        className="w-full h-full min-h-[300px] rounded-xl overflow-hidden"
      />

      {/* Controls overlay */}
      <div className="absolute bottom-4 left-4 flex gap-2">
        <button
          onClick={resetCamera}
          className="px-3 py-2 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg backdrop-blur-sm transition-colors"
          title="Reset view"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          onClick={toggleAutoRotate}
          className="px-3 py-2 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg backdrop-blur-sm transition-colors"
          title="Toggle auto-rotate"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
        <button
          onClick={toggleFullscreen}
          className="px-3 py-2 bg-black/50 hover:bg-black/70 text-white text-xs rounded-lg backdrop-blur-sm transition-colors"
          title="Toggle fullscreen"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
          </svg>
        </button>
      </div>

      {/* Instructions */}
      <div className="absolute top-4 right-4 text-white/60 text-xs bg-black/30 px-3 py-2 rounded-lg backdrop-blur-sm">
        <p>Drag to rotate | Scroll to zoom | Shift+drag to pan</p>
      </div>

      {/* Point count */}
      <div className="absolute top-4 left-4 text-white/80 text-xs bg-black/30 px-3 py-2 rounded-lg backdrop-blur-sm">
        <p>{Math.floor(positions.length / 3).toLocaleString()} points</p>
      </div>
    </div>
  );
}
