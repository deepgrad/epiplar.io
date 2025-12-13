import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import * as GaussianSplats3D from '@mkkellogg/gaussian-splats-3d';

interface SplatViewerProps {
  url: string;
  className?: string;
}

export default function SplatViewer({ url, className = '' }: SplatViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    
    // Initialize the viewer
    // The library handles the scene, camera, and renderer internally if not provided,
    // but we want to control the container.
    const viewer = new GaussianSplats3D.Viewer({
      'rootElement': container,
      'cameraUp': [0, 1, 0],
      'initialCameraPosition': [0, 1.5, 3],
      'initialCameraLookAt': [0, 0, 0],
      'gpuAcceleratedSort': true,
      'halfPrecisionCovariancesOnGPU': true,
    });
    
    viewerRef.current = viewer;

    return () => {
      viewer.dispose();
    };
  }, []);

  useEffect(() => {
    if (!viewerRef.current || !url) return;

    const loadSplat = async () => {
      try {
        setLoading(true);
        setLoadError(null);
        
        // Remove any existing scenes
        if (viewerRef.current.getSplatSceneCount() > 0) {
            viewerRef.current.removeSplatScene(0);
        }

        await viewerRef.current.addSplatScene(url, {
          'showLoadingUI': false,
          'position': [0, 0, 0],
          'rotation': [0, 0, 0],
          'scale': [1, 1, 1]
        });
        
        setLoading(false);
      } catch (err: any) {
        console.error("Failed to load splat scene:", err);
        setLoadError(err.message || "Failed to load Gaussian Splats");
        setLoading(false);
      }
    };

    loadSplat();
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

