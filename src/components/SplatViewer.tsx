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

  useEffect(() => {
    if (!containerRef.current || !url) return;

    const container = containerRef.current;
    let cancelled = false;

    setLoading(true);
    setLoadError(null);

    // IMPORTANT:
    // The library's Viewer.dispose() tries to remove `rootElement` from `document.body` when using an internal renderer.
    // In React, `rootElement` is *not* a direct child of `document.body`, which throws:
    //   NotFoundError: Failed to execute 'removeChild' on 'Node'
    // Workaround: provide an external THREE.WebGLRenderer so `usingExternalRenderer = true` and the library does not touch body.
    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: true,
      precision: 'highp',
    });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setClearColor(new THREE.Color(0x000000), 0.0);

    const setRendererSize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);

      const viewer = viewerRef.current as any;
      const cam = viewer?.camera as any;
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
      viewer?.forceRenderNextFrame?.();
    };

    // Ensure the container starts empty (React doesn't render children into it)
    container.replaceChildren();
    container.appendChild(renderer.domElement);

    setRendererSize();

    const viewer = new GaussianSplats3D.Viewer({
      'rootElement': container,
      'renderer': renderer,
      'cameraUp': [0, 1, 0],
      'initialCameraPosition': [0, 1.5, 3],
      'initialCameraLookAt': [0, 0, 0],
      // If shared memory is disabled, the library recommends disabling GPU-accelerated sorting too.
      'sharedMemoryForWorkers': false,
      'gpuAcceleratedSort': false,
      'halfPrecisionCovariancesOnGPU': true,
    });
    viewerRef.current = viewer;

    const resizeObserver = new ResizeObserver(() => {
      if (cancelled) return;
      setRendererSize();
    });
    resizeObserver.observe(container);

    (async () => {
      try {
        await viewer.addSplatScene(url, {
          'showLoadingUI': false,
          'position': [0, 0, 0],
          'rotation': [0, 0, 0, 1],
          'scale': [1, 1, 1],
          'format': GaussianSplats3D.SceneFormat.Ply,
          'splatAlphaRemovalThreshold': 1,
          // Helps confirm rendering earlier on large PLYs
          'progressiveLoad': true,
        });
        if (cancelled) return;

        viewer.start();
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Failed to load splat scene:', err);
        setLoadError(err?.message || 'Failed to load Gaussian Splats');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      resizeObserver.disconnect();

      const viewerToDispose = viewerRef.current as any;
      viewerRef.current = null;

      // Viewer.dispose() is async and can reject (e.g., "Scene disposed"). Always catch to avoid unhandled rejections.
      void Promise.resolve(viewerToDispose?.dispose?.())
        .catch(() => {})
        .finally(() => {
          try {
            renderer.dispose();
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
            <span className="text-sm font-medium">Loading 3D Splats...</span>
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

