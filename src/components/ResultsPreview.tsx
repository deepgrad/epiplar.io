import { useState, useRef, useCallback } from 'react'
import { DepthEstimationResult } from '../services/depthEstimation'
import ModelViewer, { ModelViewerRef, PlacedFurniture } from './ModelViewer'
import FurniturePanel from './FurniturePanel'
import { apiUrl, ModelAsset, LODAssetCollection } from '../services/api'

interface ResultsPreviewProps {
  onReset: () => void
  depthResults: DepthEstimationResult[]
  originalFrames?: HTMLCanvasElement[]
  modelAsset?: ModelAsset | null
  lodAssets?: LODAssetCollection | null  // NEW: LOD assets for progressive loading
}

export default function ResultsPreview({
  onReset,
  depthResults: _depthResults,
  originalFrames: _originalFrames = [],
  modelAsset = null,
  lodAssets = null,
}: ResultsPreviewProps) {
  // Note: _depthResults and _originalFrames are kept for potential future use
  void _depthResults;
  void _originalFrames;
  // Furniture editing state
  const modelViewerRef = useRef<ModelViewerRef>(null)
  const [editMode, setEditMode] = useState(false)
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null)
  const [furniture, setFurniture] = useState<PlacedFurniture[]>([])

  // Handle furniture changes from ModelViewer
  const handleFurnitureChange = useCallback((newFurniture: PlacedFurniture[]) => {
    setFurniture(newFurniture)
  }, [])

  // Handle selection changes from ModelViewer
  const handleSelectionChange = useCallback((id: string | null) => {
    setSelectedFurnitureId(id)
  }, [])

  // Determine the best asset for download (prefer full > medium > preview > legacy)
  const downloadAsset = lodAssets?.full || lodAssets?.medium || lodAssets?.preview || modelAsset

  // Check if we have any model to display
  const hasModel = !!(lodAssets?.preview || lodAssets?.medium || lodAssets?.full || modelAsset?.url)

  if (!hasModel) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 text-center">
        <p className="text-muted-foreground">No 3D model available</p>
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
          Your 3D model is ready
        </p>
      </div>

      {/* Main Visualization */}
      <div className="bg-muted/50 rounded-xl border border-border overflow-hidden opacity-0 animate-scale-in stagger-5">
        <div className="aspect-video relative">
          {hasModel ? (
            <ModelViewer
              ref={modelViewerRef}
              lodAssets={lodAssets}
              url={!lodAssets && modelAsset?.url ? apiUrl(modelAsset.url) : undefined}
              className="w-full h-full"
              editMode={editMode}
              onFurnitureChange={handleFurnitureChange}
              onSelectionChange={handleSelectionChange}
            />
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
      </div>

      {/* Furniture Panel */}
      {hasModel && (
        <div className="mt-6 opacity-0 animate-slide-up" style={{ animationDelay: '0.6s' }}>
          <FurniturePanel
            viewerRef={modelViewerRef}
            editMode={editMode}
            onEditModeChange={setEditMode}
            selectedFurnitureId={selectedFurnitureId}
            furniture={furniture}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 opacity-0 animate-fade-in" style={{ animationDelay: '1s' }}>
        <button
          onClick={onReset}
          className="w-full sm:w-auto px-6 py-3 bg-accent hover:bg-accent/80 text-foreground text-sm font-medium rounded-lg transition-all duration-300 border border-border btn-press"
        >
          Process Another Video
        </button>
        {downloadAsset?.url && (
          <a
            href={apiUrl(downloadAsset.url)}
            className="w-full sm:w-auto px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors text-center"
            download={downloadAsset.filename || 'scene.glb'}
          >
            Download 3D Model
            {downloadAsset.file_size_bytes && (
              <span className="text-xs opacity-75 ml-1">
                ({(downloadAsset.file_size_bytes / (1024 * 1024)).toFixed(1)} MB)
              </span>
            )}
          </a>
        )}
      </div>
    </div>
  )
}
