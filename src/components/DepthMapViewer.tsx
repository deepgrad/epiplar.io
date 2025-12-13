import { useEffect, useRef, useState } from 'react';
import { DepthEstimationResult, depthMapToCanvas } from '../services/depthEstimation';

interface DepthMapViewerProps {
  depthResults: DepthEstimationResult[];
  originalFrames?: HTMLCanvasElement[];
  className?: string;
}

export default function DepthMapViewer({
  depthResults,
  originalFrames = [],
  className = ''
}: DepthMapViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showOriginal, setShowOriginal] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const intervalRef = useRef<number>(0);

  useEffect(() => {
    if (!canvasRef.current || depthResults.length === 0) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentResult = depthResults[currentIndex];
    const currentOriginal = originalFrames[currentIndex];

    if (showOriginal && currentOriginal) {
      // Show original frame
      canvas.width = currentOriginal.width;
      canvas.height = currentOriginal.height;
      ctx.drawImage(currentOriginal, 0, 0);
    } else {
      // Show depth map
      const depthCanvas = depthMapToCanvas(currentResult);
      canvas.width = depthCanvas.width;
      canvas.height = depthCanvas.height;
      ctx.drawImage(depthCanvas, 0, 0);
    }
  }, [currentIndex, depthResults, originalFrames, showOriginal]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = window.setInterval(() => {
        setCurrentIndex((prev) => (prev + 1) % depthResults.length);
      }, 500);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isPlaying, depthResults.length]);

  const handlePrevious = () => {
    setCurrentIndex((prev) => (prev - 1 + depthResults.length) % depthResults.length);
  };

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % depthResults.length);
  };

  if (depthResults.length === 0) {
    return null;
  }

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="font-semibold text-slate-800">Depth Analysis</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              showOriginal
                ? 'bg-primary-100 text-primary-700'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {showOriginal ? 'Showing Original' : 'Showing Depth'}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="relative aspect-video bg-slate-900 flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full object-contain"
        />

        {/* Overlay gradient legend */}
        {!showOriginal && (
          <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-sm rounded-lg p-3">
            <div className="flex items-center gap-2 text-xs text-white mb-1">
              <span>Near</span>
              <div className="w-24 h-3 rounded bg-gradient-to-r from-white to-black" />
              <span>Far</span>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      {depthResults.length > 1 && (
        <div className="px-4 py-3 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrevious}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-primary-100 hover:bg-primary-200 text-primary-600 transition-colors"
              >
                {isPlaying ? (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                onClick={handleNext}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <span className="text-sm text-slate-500">
              Frame {currentIndex + 1} of {depthResults.length}
            </span>
          </div>

          {/* Progress bar */}
          <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / depthResults.length) * 100}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
