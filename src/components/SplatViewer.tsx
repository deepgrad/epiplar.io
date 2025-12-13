import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

interface SplatViewerProps {
  url: string;
  className?: string;
}

export default function SplatViewer({ url, className = '' }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingLabel, setLoadingLabel] = useState('Loading 3D Splats...');
  const lastProgressLabelRef = useRef<string>('');

  useEffect(() => {
    if (!containerRef.current || !url) return;

    const container = containerRef.current;
    let cancelled = false;
    let viewer: any = null;
    let renderer: THREE.WebGLRenderer | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let initTimer: number | null = null;

    setLoading(true);
    setLoadError(null);
    setLoadingLabel('Loading 3D Splats...');
    lastProgressLabelRef.current = '';

    const debugEnabled = import.meta.env.DEV;
    const log = (...args: any[]) => {
      if (debugEnabled) console.log('[SplatViewer]', ...args);
    };

    const updateLoadingLabel = (next: string) => {
      if (lastProgressLabelRef.current === next) return;
      lastProgressLabelRef.current = next;
      setLoadingLabel(next);
    };

    // React StrictMode runs effects twice in development (mount -> cleanup -> mount).
    // If we start downloading/creating blob-workers during the "test mount", the immediate cleanup aborts it,
    // which produces noisy "blob:... ERR_FILE_NOT_FOUND" + "Scene disposed" unhandled rejections.
    // Deferring init to the next tick means the test mount usually cleans up before anything starts.
    initTimer = window.setTimeout(() => {
      if (cancelled) return;
      log('init', { url });

      // IMPORTANT:
      // The library's Viewer.dispose() tries to remove `rootElement` from `document.body` when using an internal renderer.
      // In React, `rootElement` is *not* a direct child of `document.body`, which throws.
      // Workaround: provide an external THREE.WebGLRenderer so `usingExternalRenderer = true` and the library does not touch body.
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        precision: 'highp',
      });
      renderer.setPixelRatio(window.devicePixelRatio || 1);
      renderer.setClearColor(new THREE.Color(0x000000), 0.0);

      const setRendererSize = () => {
        if (!renderer) return;
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        renderer.setSize(w, h, false);

        const activeViewer = viewerRef.current as any;
        const cam = activeViewer?.camera as any;
        if (cam?.isPerspectiveCamera) {
          cam.aspect = w / h;
          cam.updateProjectionMatrix?.();
        } else if (cam?.isOrthographicCamera) {
          cam.left = w / -2;
          cam.right = w / 2;
          cam.top = h / 2;
          cam.bottom = h / -2;
          cam.updateProjectionMatrix?.();
        }
        activeViewer?.forceRenderNextFrame?.();
      };

      container.replaceChildren();
      container.appendChild(renderer.domElement);
      setRendererSize();

      viewer = new GaussianSplats3D.Viewer({
        'rootElement': container,
        'renderer': renderer,
        'cameraUp': [0, 1, 0],
        'initialCameraPosition': [0, 1.5, 3],
        'initialCameraLookAt': [0, 0, 0],
        // If shared memory is disabled, the library recommends disabling GPU-accelerated sorting too.
        'sharedMemoryForWorkers': false,
        'gpuAcceleratedSort': false,
        'halfPrecisionCovariancesOnGPU': true,
        // Improves visual quality when PLY includes SH coefficients (common for GS PLYs)
        // Will automatically clamp down if the file contains less.
        'sphericalHarmonicsDegree': 1,
        // Make splats less "blobby" by default; users can still zoom in for detail.
        'kernel2DSize': 0.15,
        'maxScreenSpaceSplatSize': 512,
      });
      viewerRef.current = viewer;
      log('viewer created', {
        sharedMemoryForWorkers: false,
        gpuAcceleratedSort: false,
      });

      resizeObserver = new ResizeObserver(() => {
        if (cancelled) return;
        setRendererSize();
      });
      resizeObserver.observe(container);

      // gaussian-splats-3d returns a custom AbortablePromise that is NOT a spec-compliant thenable.
      // Do NOT `await` it directly (can cause unhandled rejections). Await its underlying native Promise instead.
      const addPromise: any = viewer.addSplatScene(url, {
        'showLoadingUI': false,
        'position': [0, 0, 0],
        'rotation': [0, 0, 0, 1],
        'scale': [1, 1, 1],
        'format': GaussianSplats3D.SceneFormat.Ply,
        // Removes low-opacity "haze" splats. Higher => cleaner/sharper, but can remove thin geometry.
        // Library docs/examples commonly use 5-20.
        'splatAlphaRemovalThreshold': 8,
        // Helps confirm rendering earlier on large PLYs
        'progressiveLoad': true,
        'onProgress': (percentComplete: number, percentCompleteLabel: string, loaderStatus: unknown) => {
          if (cancelled) return;
          const statusLabel =
            typeof loaderStatus === 'string'
              ? loaderStatus
              : (typeof loaderStatus === 'number'
                  ? (loaderStatus === 0 ? 'Downloading' : loaderStatus === 1 ? 'Processing' : 'Loading')
                  : 'Loading');
          const pct = Number.isFinite(percentComplete) ? `${percentComplete.toFixed(1)}%` : (percentCompleteLabel || '');
          const text = `${statusLabel}${pct ? ` ${pct}` : ''}`;
          updateLoadingLabel(text);
          log('progress', { percentComplete, percentCompleteLabel, loaderStatus });
        },
      });

      void Promise.resolve(addPromise?.promise ?? addPromise)
        .then(() => {
          if (cancelled) return;

          // Debug stats (helps diagnose "blank canvas" with no errors)
          try {
            const sceneCount = viewer?.getSceneCount?.() ?? viewer?.getSplatMesh?.()?.getSceneCount?.();
            const splatMesh = viewer?.getSplatMesh?.();
            const splatCount = splatMesh?.getSplatCount?.() ?? 0;
            log('loaded', { sceneCount, splatCount });

            if (!splatCount || splatCount <= 0) {
              setLoadError('Loaded 0 splats from the PLY. This usually means an incompatible PLY schema or all splats were filtered.');
              setLoading(false);
              return;
            }

            // Auto-fit camera using a small sample of splat centers. This fixes the common case where the scene is far from origin
            // (or larger than the default far plane), resulting in an empty view with no errors.
            const sampleCount = Math.min(2000, splatCount);
            const tmp = new THREE.Vector3();
            const min = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
            const max = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
            for (let i = 0; i < sampleCount; i++) {
              const idx = Math.floor((i / sampleCount) * (splatCount - 1));
              splatMesh.getSplatCenter(idx, tmp, true);
              min.min(tmp);
              max.max(tmp);
            }

            if (Number.isFinite(min.x) && Number.isFinite(max.x)) {
              const center = min.clone().add(max).multiplyScalar(0.5);
              const size = max.clone().sub(min);
              const radius = Math.max(size.x, size.y, size.z) * 0.5 || 1;
              const cam: any = viewer.camera;
              const controls: any = viewer.controls;

              // Expand clip planes if needed
              if (cam?.isPerspectiveCamera) {
                const fovRad = (cam.fov * Math.PI) / 180;
                const distance = (radius / Math.tan(fovRad / 2)) * 1.25;

                const currentTarget = controls?.target ?? new THREE.Vector3(0, 0, 0);
                const dir = cam.position.clone().sub(currentTarget);
                if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
                dir.normalize();

                cam.near = Math.min(cam.near ?? 0.1, Math.max(distance / 10_000, 0.01));
                cam.far = Math.max(cam.far ?? 1000, distance + radius * 10);
                cam.position.copy(center.clone().add(dir.multiplyScalar(distance)));
                cam.lookAt(center);
                cam.updateProjectionMatrix?.();
              }

              if (controls?.target) {
                controls.target.copy(center);
                controls.update?.();
              }

              viewer.forceRenderNextFrame?.();
              log('camera fit', {
                min: min.toArray(),
                max: max.toArray(),
                center: center.toArray(),
                radius,
                camPos: viewer?.camera?.position?.toArray?.(),
                camNear: viewer?.camera?.near,
                camFar: viewer?.camera?.far,
              });
            }
          } catch (e) {
            log('debug stats failed', e);
          }

          viewer.start();
          setLoading(false);
        })
        .catch((err: any) => {
          if (cancelled) return;
          // Abort during teardown is expected; don't spam console/UI.
          const msg = String(err?.message || err);
          if (msg.includes('Scene disposed')) return;
          console.error('Failed to load splat scene:', err);
          setLoadError(err?.message || 'Failed to load Gaussian Splats');
          setLoading(false);
        });
    }, 0);

    return () => {
      cancelled = true;
      if (initTimer !== null) {
        window.clearTimeout(initTimer);
        initTimer = null;
      }
      resizeObserver?.disconnect();

      const viewerToDispose = viewerRef.current as any;
      viewerRef.current = null;

      // Viewer.dispose() is async and can reject (e.g., "Scene disposed"). Always catch to avoid unhandled rejections.
      void Promise.resolve(viewerToDispose?.dispose?.())
        .catch(() => {})
        .finally(() => {
          try {
            renderer?.dispose();
          } catch {
            // ignore
          }
          // Remove any leftover DOM the viewer/renderer created
          try {
            container.replaceChildren();
          } catch {
            // ignore
          }
        });
    };
  }, [url]);

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full min-h-[300px] rounded-xl overflow-hidden bg-[#0b1220]" />
      
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <span className="text-sm font-medium">{loadingLabel}</span>
          </div>
        </div>
      )}

      {loadError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white text-sm px-6 text-center z-10">
          {loadError}
        </div>
      )}
      
      <div className="absolute top-4 right-4 text-white/70 text-xs bg-black/30 px-3 py-2 rounded-lg backdrop-blur-sm pointer-events-none z-10">
        <p>Left Click: Rotate | Right Click: Pan | Scroll: Zoom</p>
      </div>
    </div>
  );
}

