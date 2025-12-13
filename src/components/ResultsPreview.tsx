import { useState } from 'react'
import { DepthEstimationResult } from '../services/depthEstimation'
import ModelViewer from './ModelViewer'
import SplatViewer from './SplatViewer'
import DepthMapViewer from './DepthMapViewer'
import { apiUrl, ModelAsset } from '../services/api'

interface ResultsPreviewProps {
  onReset: () => void
  depthResults: DepthEstimationResult[]
  originalFrames?: HTMLCanvasElement[]
  modelAsset?: ModelAsset | null
}

type ViewMode = 'model' | 'depth'

export default function ResultsPreview({
  onReset,
  depthResults,
  originalFrames = [],
  modelAsset = null,
}: ResultsPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('model')

  if (depthResults.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 text-center">
        <p className="text-muted-foreground">No depth data available</p>
        <button
          onClick={onReset}
          className="mt-4 px-6 py-3 bg-foreground hover:bg-primary-200 text-background rounded-lg font-medium transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Success Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500/10 border border-green-500/20 text-green-500 rounded-full text-xs font-medium mb-4 opacity-0 animate-slide-down stagger-1">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Processing Complete
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-foreground mb-2 opacity-0 animate-slide-up stagger-2">
          Your 3D Reconstruction
        </h2>
        <p className="text-sm text-muted-foreground opacity-0 animate-slide-up stagger-3">
          Successfully processed {depthResults.length} frames into a 3D model
        </p>
      </div>

      {/* View Mode Tabs */}
      <div className="flex justify-center mb-6 opacity-0 animate-fade-in stagger-4">
        <div className="inline-flex bg-muted p-1 rounded-lg border border-border">
          <button
            onClick={() => setViewMode('model')}
            className={`px-5 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${
              viewMode === 'model'
                ? 'bg-brand text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            3D Model
          </button>
          <button
            onClick={() => setViewMode('depth')}
            className={`px-5 py-2.5 text-sm font-medium rounded-md transition-all duration-200 ${
              viewMode === 'depth'
                ? 'bg-brand text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Depth Maps
          </button>
        </div>
      </div>

      {/* Main Visualization */}
      <div className="bg-muted/50 rounded-xl border border-border overflow-hidden opacity-0 animate-scale-in stagger-5">
        {viewMode === 'model' && (
          <div className="aspect-video">
            {modelAsset?.url ? (
              (['gs', 'ply', 'splat'].includes(modelAsset.format || '')) ? (
                <SplatViewer url={apiUrl(modelAsset.url)} className="w-full h-full" />
              ) : (
                <ModelViewer url={apiUrl(modelAsset.url)} className="w-full h-full" />
              )
            ) : (
              <div className="w-full h-full min-h-[300px] flex flex-col items-center justify-center text-muted-foreground text-sm gap-3">
                <div className="w-16 h-16 rounded-xl bg-accent flex items-center justify-center">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <p>No 3D model was generated</p>
              </div>
            )}
          </div>
        )}

        {viewMode === 'depth' && (
          <DepthMapViewer
            depthResults={depthResults}
            originalFrames={originalFrames}
          />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
        {[
          { value: depthResults.length.toString(), label: 'Frames' },
          { value: modelAsset?.format?.toUpperCase?.() || '—', label: 'Format' },
          { value: `${depthResults[0]?.width}x${depthResults[0]?.height}`, label: 'Resolution' },
          { value: 'DA3', label: 'AI Model' },
        ].map((stat, index) => (
          <div
            key={stat.label}
            className="bg-muted/50 rounded-lg border border-border p-4 text-center hover:border-brand/30 transition-all duration-300 opacity-0 animate-slide-up"
            style={{ animationDelay: `${0.6 + index * 0.1}s` }}
          >
            <p className="text-xl font-semibold text-foreground tabular-nums">{stat.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 opacity-0 animate-fade-in" style={{ animationDelay: '1s' }}>
        <button
          onClick={onReset}
          className="w-full sm:w-auto px-6 py-3 bg-accent hover:bg-accent/80 text-foreground text-sm font-medium rounded-lg transition-all duration-300 border border-border btn-press"
        >
          Process Another Video
        </button>
        {modelAsset?.url && (
          <a
            href={apiUrl(modelAsset.url)}
            className="w-full sm:w-auto px-6 py-3 bg-brand hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-all duration-300 text-center btn-press brand-glow flex items-center justify-center gap-2"
            download={modelAsset.filename || undefined}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Model
          </a>
        )}
      </div>
    </div>
  )
}
