import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { LODAssetCollection, ModelAsset, apiUrl } from '../services/api';

type LODLevel = 'preview' | 'medium' | 'full';

interface ModelViewerProps {
  url?: string; // Legacy single URL support
  lodAssets?: LODAssetCollection | null; // NEW: LOD collection for progressive loading
  className?: string;
}

export default function ModelViewer({ url, lodAssets, className = '' }: ModelViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const animationFrameRef = useRef<number>(0);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const cameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentLOD, setCurrentLOD] = useState<LODLevel | null>(null);
  const [loadingLOD, setLoadingLOD] = useState<LODLevel | null>(null);
  const [loadedLODs, setLoadedLODs] = useState<Set<LODLevel>>(new Set());

  // Initialize Draco loader once
  useEffect(() => {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    // Use Google CDN for Draco decoder
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderConfig({ type: 'js' });
    loader.setDRACOLoader(dracoLoader);
    loaderRef.current = loader;

    return () => {
      dracoLoader.dispose();
    };
  }, []);

  // Scene setup
  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x4a3f99); // Brand indigo background
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 10_000);
    camera.position.set(0, 1.5, 3);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;
    controls.enablePan = true;
    controls.autoRotate = false;
    controlsRef.current = controls;

    // Lighting for meshes (point clouds ignore it)
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(3, 5, 2);
    scene.add(dir);

    // Grid removed - model should fill the screen

    const animate = () => {
      animationFrameRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

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

  // Save camera state before model swap
  const saveCameraState = useCallback(() => {
    if (cameraRef.current && controlsRef.current) {
      cameraStateRef.current = {
        position: cameraRef.current.position.clone(),
        target: controlsRef.current.target.clone(),
      };
    }
  }, []);

  // Restore camera state after model swap
  const restoreCameraState = useCallback(() => {
    if (cameraStateRef.current && cameraRef.current && controlsRef.current) {
      cameraRef.current.position.copy(cameraStateRef.current.position);
      controlsRef.current.target.copy(cameraStateRef.current.target);
      controlsRef.current.update();
    }
  }, []);

  // Load a specific model URL
  const loadModel = useCallback(async (
    modelUrl: string,
    level: LODLevel | null = null,
    isFirstLoad: boolean = false
  ): Promise<void> => {
    if (!sceneRef.current || !loaderRef.current) return;

    if (level) {
      setLoadingLOD(level);
    }
    setLoadError(null);

    return new Promise((resolve, reject) => {
      loaderRef.current!.load(
        modelUrl,
        (gltf) => {
          const root = gltf.scene;

          // Save camera state if replacing existing model
          if (modelRef.current && !isFirstLoad) {
            saveCameraState();
          }

          // Remove old model
          if (modelRef.current) {
            sceneRef.current!.remove(modelRef.current);
            modelRef.current.traverse((obj) => {
              const mesh = obj as THREE.Mesh;
              if (mesh.geometry) mesh.geometry.dispose();
              const material = (mesh as any).material as THREE.Material | THREE.Material[] | undefined;
              if (Array.isArray(material)) material.forEach((m) => m.dispose());
              else material?.dispose();
            });
          }

          sceneRef.current!.add(root);
          modelRef.current = root;

          // Center model + fit camera to fill screen (only for first load)
          if (isFirstLoad) {
            const box = new THREE.Box3().setFromObject(root);
            const size = box.getSize(new THREE.Vector3());
            const center = box.getCenter(new THREE.Vector3());
            root.position.sub(center);

            // Calculate distance to fit model in viewport
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const distance = maxDim * 1.2; // Closer to fill screen better
            
            const cam = cameraRef.current!;
            // Position camera to view the model from an angle
            cam.position.set(distance * 0.7, distance * 0.5, distance * 0.7);
            cam.lookAt(0, 0, 0);
            controlsRef.current!.target.set(0, 0, 0);
            controlsRef.current!.update();
          } else {
            // Center model but restore camera
            const box = new THREE.Box3().setFromObject(root);
            const center = box.getCenter(new THREE.Vector3());
            root.position.sub(center);
            restoreCameraState();
          }

          if (level) {
            setCurrentLOD(level);
            setLoadedLODs(prev => new Set([...prev, level]));
            setLoadingLOD(null);
          }
          resolve();
        },
        undefined,
        (err: unknown) => {
          const message =
            err instanceof Error
              ? err.message
              : (typeof err === 'object' && err !== null && 'message' in err)
                ? String((err as { message: unknown }).message)
                : `Failed to load ${level || ''} quality model`;
          setLoadError(message);
          setLoadingLOD(null);
          reject(new Error(message));
        }
      );
    });
  }, [saveCameraState, restoreCameraState]);

  // Switch to a specific LOD level
  const switchToLOD = useCallback(async (level: LODLevel) => {
    if (!lodAssets) return;

    const asset = lodAssets[level];
    if (!asset) return;

    try {
      await loadModel(apiUrl(asset.url), level, false);
    } catch (e) {
      console.error(`Failed to switch to ${level}:`, e);
    }
  }, [lodAssets, loadModel]);

  // Progressive LOD loading
  useEffect(() => {
    // Reset state when assets change
    setLoadedLODs(new Set());
    setCurrentLOD(null);
    setLoadError(null);

    if (!lodAssets) {
      // Legacy mode: single URL
      if (url && loaderRef.current) {
        loadModel(url, null, true);
      }
      return;
    }

    // Progressive loading: preview -> medium -> full
    const loadProgressively = async () => {
      try {
        // 1. Load preview immediately (fast)
        if (lodAssets.preview) {
          await loadModel(apiUrl(lodAssets.preview.url), 'preview', true);
        }

        // 2. Load medium in background after short delay
        if (lodAssets.medium) {
          await new Promise(r => setTimeout(r, 500));
          await loadModel(apiUrl(lodAssets.medium.url), 'medium', false);
        }

        // 3. Load full quality last (can be large)
        if (lodAssets.full) {
          await new Promise(r => setTimeout(r, 1000));
          await loadModel(apiUrl(lodAssets.full.url), 'full', false);
        }
      } catch (e) {
        console.error('Progressive loading error:', e);
      }
    };

    loadProgressively();
  }, [lodAssets, url, loadModel]);

  // Format file size for display
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format point count for display
  const formatPoints = (count?: number) => {
    if (!count) return '';
    if (count < 1000) return `${count}`;
    if (count < 1000000) return `${(count / 1000).toFixed(0)}K`;
    return `${(count / 1000000).toFixed(1)}M`;
  };

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full min-h-[300px] rounded-xl overflow-hidden" />

      {/* LOD Quality Switcher */}
      {lodAssets && (
        <div className="absolute top-4 left-4 bg-black/60 text-white text-xs px-3 py-2 rounded-lg backdrop-blur-sm">
          <div className="flex items-center gap-1">
            <span className="mr-1 opacity-70">Quality:</span>
            {(['preview', 'medium', 'full'] as LODLevel[]).map((level) => {
              const asset = lodAssets[level];
              const isActive = currentLOD === level;
              const isLoaded = loadedLODs.has(level);
              const isLoading = loadingLOD === level;
              const isAvailable = !!asset;

              return (
                <button
                  key={level}
                  onClick={() => isAvailable && level !== currentLOD && switchToLOD(level)}
                  disabled={!isAvailable || isLoading}
                  className={`px-2 py-1 rounded transition-colors ${
                    isActive
                      ? 'bg-sky-500 text-white'
                      : isLoaded
                        ? 'bg-white/20 hover:bg-white/30 text-white'
                        : isAvailable
                          ? 'bg-white/10 text-white/70 hover:bg-white/20'
                          : 'bg-white/5 text-white/30 cursor-not-allowed'
                  }`}
                  title={asset ? `${formatPoints(asset.point_count)} points, ${formatSize(asset.file_size_bytes)}` : 'Not available'}
                >
                  {level}
                  {isLoading && (
                    <span className="ml-1 inline-block animate-pulse">...</span>
                  )}
                </button>
              );
            })}
          </div>
          {/* Show current LOD info */}
          {currentLOD && lodAssets[currentLOD] && (
            <div className="mt-1 text-[10px] opacity-60">
              {formatPoints(lodAssets[currentLOD]?.point_count)} points
              {lodAssets[currentLOD]?.file_size_bytes && (
                <> | {formatSize(lodAssets[currentLOD]?.file_size_bytes)}</>
              )}
            </div>
          )}
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm px-6 text-center">
          {loadError}
        </div>
      )}

      <div className="absolute top-4 right-4 text-white/70 text-xs bg-black/30 px-3 py-2 rounded-lg backdrop-blur-sm">
        <p>Drag to rotate | Scroll to zoom | Shift+drag to pan</p>
      </div>
    </div>
  );
}
