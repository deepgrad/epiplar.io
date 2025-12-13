import { useEffect, useRef, useState } from 'react';
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

    // Dispose previous viewer if it exists
    if (viewerRef.current) {
      try {
        viewerRef.current.dispose();
      } catch (e) {
        // Ignore disposal errors
      }
      viewerRef.current = null;
    }

    setLoading(true);
    setLoadError(null);

    // Create viewer and load scene
    const initViewer = async () => {
      try {
        const viewer = new GaussianSplats3D.Viewer({
          'rootElement': container,
          'cameraUp': [0, 1, 0],
          'initialCameraPosition': [0, 1.5, 3],
          'initialCameraLookAt': [0, 0, 0],
          'gpuAcceleratedSort': true,
          'halfPrecisionCovariancesOnGPU': true,
        });

        viewerRef.current = viewer;

        await viewer.addSplatScene(url, {
          'showLoadingUI': false,
          'position': [0, 0, 0],
          'rotation': [0, 0, 0, 1],
          'scale': [1, 1, 1]
        });

        viewer.start();
        setLoading(false);
      } catch (err: any) {
        console.error("Failed to load splat scene:", err);
        setLoadError(err.message || "Failed to load Gaussian Splats");
        setLoading(false);
      }
    };

    initViewer();

    return () => {
      if (viewerRef.current) {
        try {
          viewerRef.current.dispose();
        } catch (e) {
          // Ignore disposal errors
        }
        viewerRef.current = null;
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

