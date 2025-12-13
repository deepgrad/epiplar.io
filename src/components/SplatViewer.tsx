import { useEffect, useRef, useState } from 'react';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

interface SplatViewerProps {
  url: string;
  className?: string;
}

export default function SplatViewer({ url, className = '' }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const isDisposedRef = useRef(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !url) return;

    const container = containerRef.current;
    isDisposedRef.current = false;

    // Clear container manually before creating new viewer
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }

    setLoading(true);
    setLoadError(null);

    let viewer: any = null;

    // Create viewer and load scene
    const initViewer = async () => {
      try {
        // Check if already disposed before creating
        if (isDisposedRef.current) return;

        viewer = new GaussianSplats3D.Viewer({
          'rootElement': container,
          'cameraUp': [0, 1, 0],
          'initialCameraPosition': [0, 1.5, 3],
          'initialCameraLookAt': [0, 0, 0],
          'gpuAcceleratedSort': true,
          'halfPrecisionCovariancesOnGPU': true,
          // Disable shared memory to avoid CORS/worker issues
          'sharedMemoryForWorkers': false,
        });

        viewerRef.current = viewer;

        // Check again before loading scene
        if (isDisposedRef.current) {
          viewer.dispose();
          return;
        }

        await viewer.addSplatScene(url, {
          'showLoadingUI': false,
          'position': [0, 0, 0],
          'rotation': [0, 0, 0, 1],
          'scale': [1, 1, 1],
          'format': GaussianSplats3D.SceneFormat.Ply,
          'splatAlphaRemovalThreshold': 1,
        });

        // Check again before starting
        if (isDisposedRef.current) {
          viewer.dispose();
          return;
        }

        viewer.start();
        setLoading(false);
      } catch (err: any) {
        if (!isDisposedRef.current) {
          console.error("Failed to load splat scene:", err);
          setLoadError(err.message || "Failed to load Gaussian Splats");
          setLoading(false);
        }
      }
    };

    initViewer();

    return () => {
      isDisposedRef.current = true;
      if (viewerRef.current) {
        try {
          viewerRef.current.dispose();
        } catch (e) {
          // Ignore disposal errors - manually clean up DOM
        }
        viewerRef.current = null;
      }
      // Clean up container manually
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
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

