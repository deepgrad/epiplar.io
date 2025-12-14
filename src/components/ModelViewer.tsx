import { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { LODAssetCollection, apiUrl } from '../services/api';

type LODLevel = 'preview' | 'medium' | 'full';

// Furniture object that can be placed in the scene
export interface PlacedFurniture {
  id: string;
  name: string;
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

// Methods exposed via ref for external control
export interface ModelViewerRef {
  addFurniture: (url: string, name?: string) => Promise<string>;
  removeFurniture: (id: string) => void;
  selectFurniture: (id: string | null) => void;
  setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => void;
  getFurnitureList: () => PlacedFurniture[];
  exportScene: () => void;
}

interface ModelViewerProps {
  url?: string; // Legacy single URL support
  lodAssets?: LODAssetCollection | null; // NEW: LOD collection for progressive loading
  className?: string;
  editMode?: boolean; // Enable furniture editing mode
  onFurnitureChange?: (furniture: PlacedFurniture[]) => void;
  onSelectionChange?: (selectedId: string | null) => void;
}

const ModelViewer = forwardRef<ModelViewerRef, ModelViewerProps>(function ModelViewer(
  { url, lodAssets, className = '', editMode = false, onFurnitureChange, onSelectionChange },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  const transformHelperRef = useRef<THREE.Object3D | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const animationFrameRef = useRef<number>(0);
  const loaderRef = useRef<GLTFLoader | null>(null);
  const cameraStateRef = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  // Furniture-related refs
  const furnitureMapRef = useRef<Map<string, THREE.Object3D>>(new Map());
  const furnitureDataRef = useRef<Map<string, PlacedFurniture>>(new Map());
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());

  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentLOD, setCurrentLOD] = useState<LODLevel | null>(null);
  const [loadingLOD, setLoadingLOD] = useState<LODLevel | null>(null);
  const [loadedLODs, setLoadedLODs] = useState<Set<LODLevel>>(new Set());
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
  const [furnitureCount, setFurnitureCount] = useState(0); // Trigger re-renders

  // Create grid texture for background
  const createGridTexture = useCallback(() => {
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
  }, []);

  // Generate unique ID for furniture
  const generateFurnitureId = useCallback(() => {
    return `furniture_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Get current furniture list
  const getFurnitureList = useCallback((): PlacedFurniture[] => {
    return Array.from(furnitureDataRef.current.values());
  }, []);

  // Notify parent of furniture changes
  const notifyFurnitureChange = useCallback(() => {
    setFurnitureCount(furnitureDataRef.current.size);
    onFurnitureChange?.(getFurnitureList());
  }, [onFurnitureChange, getFurnitureList]);

  // Update furniture data from Three.js object
  const syncFurnitureData = useCallback((id: string) => {
    const obj = furnitureMapRef.current.get(id);
    const data = furnitureDataRef.current.get(id);
    if (obj && data) {
      data.position = [obj.position.x, obj.position.y, obj.position.z];
      data.rotation = [obj.rotation.x, obj.rotation.y, obj.rotation.z];
      data.scale = [obj.scale.x, obj.scale.y, obj.scale.z];
      notifyFurnitureChange();
    }
  }, [notifyFurnitureChange]);

  // Add furniture to scene
  const addFurniture = useCallback(async (furnitureUrl: string, name?: string): Promise<string> => {
    if (!sceneRef.current || !loaderRef.current) {
      throw new Error('Scene not initialized');
    }

    const id = generateFurnitureId();
    const displayName = name || `Object ${furnitureDataRef.current.size + 1}`;

    return new Promise((resolve, reject) => {
      loaderRef.current!.load(
        furnitureUrl,
        (gltf) => {
          const root = gltf.scene;

          // Calculate bounding box to normalize scale
          const box = new THREE.Box3().setFromObject(root);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          // Normalize to reasonable size (about 1 unit)
          const targetSize = 0.5;
          const scaleFactor = maxDim > 0 ? targetSize / maxDim : 1;
          root.scale.setScalar(scaleFactor);

          // Center the model at its base
          box.setFromObject(root);
          const center = box.getCenter(new THREE.Vector3());
          root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));

          // Place in front of camera initially
          if (cameraRef.current && controlsRef.current) {
            const target = controlsRef.current.target.clone();
            root.position.add(target);
          }

          // Store reference
          root.userData.furnitureId = id;
          root.userData.isFurniture = true;
          furnitureMapRef.current.set(id, root);

          // Store data
          const furnitureData: PlacedFurniture = {
            id,
            name: displayName,
            url: furnitureUrl,
            position: [root.position.x, root.position.y, root.position.z],
            rotation: [root.rotation.x, root.rotation.y, root.rotation.z],
            scale: [root.scale.x, root.scale.y, root.scale.z],
          };
          furnitureDataRef.current.set(id, furnitureData);

          sceneRef.current!.add(root);
          notifyFurnitureChange();

          // Auto-select the newly added furniture
          setSelectedFurnitureId(id);
          onSelectionChange?.(id);

          resolve(id);
        },
        undefined,
        (error) => {
          console.error('Failed to load furniture:', error);
          reject(new Error('Failed to load furniture model'));
        }
      );
    });
  }, [generateFurnitureId, notifyFurnitureChange, onSelectionChange]);

  // Remove furniture from scene
  const removeFurniture = useCallback((id: string) => {
    const obj = furnitureMapRef.current.get(id);
    if (obj && sceneRef.current) {
      // Detach from transform controls if selected
      if (selectedFurnitureId === id && transformControlsRef.current) {
        transformControlsRef.current.detach();
      }

      // Remove from scene and dispose
      sceneRef.current.remove(obj);
      obj.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material?.dispose();
      });

      furnitureMapRef.current.delete(id);
      furnitureDataRef.current.delete(id);

      if (selectedFurnitureId === id) {
        setSelectedFurnitureId(null);
        onSelectionChange?.(null);
      }

      notifyFurnitureChange();
    }
  }, [selectedFurnitureId, notifyFurnitureChange, onSelectionChange]);

  // Select furniture for editing
  const selectFurniture = useCallback((id: string | null) => {
    setSelectedFurnitureId(id);
    onSelectionChange?.(id);

    if (transformControlsRef.current) {
      if (id) {
        const obj = furnitureMapRef.current.get(id);
        if (obj) {
          transformControlsRef.current.attach(obj);
        }
      } else {
        transformControlsRef.current.detach();
      }
    }
  }, [onSelectionChange]);

  // Handle click to select furniture
  const handleCanvasClick = useCallback((event: MouseEvent) => {
    if (!editMode || !containerRef.current || !cameraRef.current || !sceneRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

    // Get all furniture objects
    const furnitureObjects = Array.from(furnitureMapRef.current.values());
    const intersects = raycasterRef.current.intersectObjects(furnitureObjects, true);

    if (intersects.length > 0) {
      // Find the root furniture object
      let obj = intersects[0].object;
      while (obj.parent && !obj.userData.isFurniture) {
        obj = obj.parent;
      }
      if (obj.userData.furnitureId) {
        selectFurniture(obj.userData.furnitureId);
        return;
      }
    }

    // Clicked on empty space - deselect
    selectFurniture(null);
  }, [editMode, selectFurniture]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!editMode) return;

    switch (event.key.toLowerCase()) {
      case 't':
        setTransformMode('translate');
        if (transformControlsRef.current) transformControlsRef.current.setMode('translate');
        break;
      case 'r':
        setTransformMode('rotate');
        if (transformControlsRef.current) transformControlsRef.current.setMode('rotate');
        break;
      case 's':
        setTransformMode('scale');
        if (transformControlsRef.current) transformControlsRef.current.setMode('scale');
        break;
      case 'delete':
      case 'backspace':
        if (selectedFurnitureId) {
          event.preventDefault();
          removeFurniture(selectedFurnitureId);
        }
        break;
      case 'escape':
        selectFurniture(null);
        break;
    }
  }, [editMode, selectedFurnitureId, removeFurniture, selectFurniture]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    addFurniture,
    removeFurniture,
    selectFurniture,
    setTransformMode: (mode: 'translate' | 'rotate' | 'scale') => {
      setTransformMode(mode);
      if (transformControlsRef.current) transformControlsRef.current.setMode(mode);
    },
    getFurnitureList,
    exportScene: () => {
      // TODO: Implement GLB export with all furniture
      console.log('Export scene - furniture:', getFurnitureList());
    },
  }), [addFurniture, removeFurniture, selectFurniture, getFurnitureList]);

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

    // TransformControls for furniture manipulation
    const transformControls = new TransformControls(camera, renderer.domElement);
    transformControls.setMode('translate');
    transformControls.setSize(0.75);
    // Three.js r169+: TransformControls no longer extends Object3D
    // Use getHelper() to get the visual gizmo that can be added to the scene
    const helper = transformControls.getHelper();
    scene.add(helper);
    transformControlsRef.current = transformControls;
    transformHelperRef.current = helper;

    // Disable orbit controls while transforming
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value;
    });

    // Sync furniture data when transform ends
    transformControls.addEventListener('objectChange', () => {
      const obj = transformControls.object;
      if (obj?.userData.furnitureId) {
        syncFurnitureData(obj.userData.furnitureId);
      }
    });

    // Lighting for meshes (point clouds ignore it)
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(3, 5, 2);
    scene.add(dir);

    // Add hemisphere light for better furniture rendering
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4);
    hemiLight.position.set(0, 10, 0);
    scene.add(hemiLight);

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

      // Update texture repeat to maintain square grid cells
      if (gridTexture && sceneRef.current?.background === gridTexture) {
        const aspect = w / h;
        if (aspect > 1) {
          gridTexture.repeat.set(4 * aspect, 4);
        } else {
          gridTexture.repeat.set(4, 4 / aspect);
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameRef.current);
      transformControls.dispose();
      controls.dispose();
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [syncFurnitureData]);

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
      console.log(`[ModelViewer] Loading model: ${modelUrl}`);
      loaderRef.current!.load(
        modelUrl,
        (gltf) => {
          console.log('[ModelViewer] GLTF loaded:', {
            hasScene: !!gltf.scene,
            scenesCount: gltf.scenes?.length ?? 0,
            animationsCount: gltf.animations?.length ?? 0,
          });

          // Get scene root - handle cases where gltf.scene might be undefined or empty
          let root: THREE.Object3D | undefined = gltf.scene;

          // If scene is undefined, try to create a group from all nodes
          if (!root && gltf.scenes && gltf.scenes.length > 0) {
            root = gltf.scenes[0];
          }

          // If still no root, create a group and add all top-level objects
          if (!root) {
            console.warn('[ModelViewer] GLTF has no scene, attempting to extract nodes');
            root = new THREE.Group();

            // Method 1: Try to get objects from the parser associations
            if (gltf.parser) {
              const associations = gltf.parser.associations;
              if (associations) {
                associations.forEach((_value: unknown, key: unknown) => {
                  if (key instanceof THREE.Object3D && key.parent === null) {
                    root!.add(key);
                  }
                });
              }
            }

            // Method 2: If still empty, try to extract from nodes array
            if (root.children.length === 0) {
              // Some GLB files have nodes directly accessible
              const nodes = (gltf as unknown as { nodes?: THREE.Object3D[] }).nodes;
              if (nodes && Array.isArray(nodes)) {
                nodes.forEach((node) => {
                  if (node instanceof THREE.Object3D && !node.parent) {
                    root!.add(node);
                  }
                });
              }
            }

            console.log('[ModelViewer] Created root group with children:', root.children.length);
          }

          // Validate root is a proper Object3D
          if (!root || !(root instanceof THREE.Object3D)) {
            console.error('[ModelViewer] Failed to get valid scene from GLTF:', gltf);
            const message = 'Invalid 3D model format';
            setLoadError(message);
            setLoadingLOD(null);
            reject(new Error(message));
            return;
          }

          console.log('[ModelViewer] Scene root validated:', {
            type: root.type,
            childrenCount: root.children.length,
            isGroup: root instanceof THREE.Group,
          });

          // Log children types for debugging and filter out invalid objects
          const invalidChildren: THREE.Object3D[] = [];
          root.traverse((child) => {
            console.log('[ModelViewer] Scene child:', child.type, child.name || '(unnamed)');
            // Check if child is a valid Object3D
            if (child !== root && !(child instanceof THREE.Object3D)) {
              console.warn('[ModelViewer] Invalid child found:', child);
              invalidChildren.push(child);
            }
          });

          // Remove invalid children
          invalidChildren.forEach((invalid) => {
            if (invalid.parent) {
              invalid.parent.remove(invalid);
            }
          });

          if (invalidChildren.length > 0) {
            console.warn(`[ModelViewer] Removed ${invalidChildren.length} invalid children`);
          }

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

          // Add root to scene with error handling
          try {
            console.log('[ModelViewer] Adding root to scene...');
            sceneRef.current!.add(root);
            console.log('[ModelViewer] Root added successfully');
          } catch (addError) {
            console.error('[ModelViewer] Failed to add root to scene:', addError, root);
            const message = 'Failed to display 3D model';
            setLoadError(message);
            setLoadingLOD(null);
            reject(new Error(message));
            return;
          }
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

  // Set up click and keyboard event listeners for edit mode
  useEffect(() => {
    if (!editMode) return;

    const container = containerRef.current;
    if (!container) return;

    // Add click listener to the renderer canvas
    const canvas = rendererRef.current?.domElement;
    if (canvas) {
      canvas.addEventListener('click', handleCanvasClick);
    }

    // Add keyboard listener
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      if (canvas) {
        canvas.removeEventListener('click', handleCanvasClick);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [editMode, handleCanvasClick, handleKeyDown]);

  // Update transform controls visibility based on edit mode
  useEffect(() => {
    if (transformControlsRef.current) {
      transformControlsRef.current.enabled = editMode;
    }
    // Control visibility via the helper (the actual Object3D in the scene)
    if (transformHelperRef.current) {
      transformHelperRef.current.visible = editMode && selectedFurnitureId !== null;
    }
  }, [editMode, selectedFurnitureId]);

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

      {/* Edit mode controls */}
      {editMode && (
        <div className="absolute bottom-4 left-4 flex flex-col gap-2">
          {/* Transform mode buttons */}
          <div className="bg-black/60 text-white text-xs px-2 py-1.5 rounded-lg backdrop-blur-sm flex items-center gap-1">
            <span className="opacity-70 mr-1">Mode:</span>
            {(['translate', 'rotate', 'scale'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setTransformMode(mode);
                  if (transformControlsRef.current) transformControlsRef.current.setMode(mode);
                }}
                className={`px-2 py-1 rounded transition-colors ${
                  transformMode === mode
                    ? 'bg-sky-500 text-white'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
                title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} (${mode[0].toUpperCase()})`}
              >
                {mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale'}
              </button>
            ))}
          </div>

          {/* Furniture count */}
          {furnitureCount > 0 && (
            <div className="bg-black/60 text-white text-xs px-3 py-2 rounded-lg backdrop-blur-sm">
              <span className="opacity-70">Objects:</span> {furnitureCount}
              {selectedFurnitureId && (
                <span className="ml-2 text-sky-400">
                  (1 selected)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Help text - changes based on edit mode */}
      <div className="absolute top-4 right-4 text-white/70 text-xs bg-black/30 px-3 py-2 rounded-lg backdrop-blur-sm">
        {editMode ? (
          <div className="space-y-0.5">
            <p>Click object to select | T/R/S to switch mode</p>
            <p>Delete to remove | Esc to deselect</p>
          </div>
        ) : (
          <p>Drag to rotate | Scroll to zoom | Shift+drag to pan</p>
        )}
      </div>
    </div>
  );
});

export default ModelViewer;
