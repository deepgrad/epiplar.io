import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { DepthEstimationResult } from '../services/depthEstimation'
import ModelViewer, { ModelViewerRef, PlacedFurniture } from './ModelViewer'
import FurniturePanel from './FurniturePanel'
import FurnitureSearch from './FurnitureSearch'
import ProductDetailModal from './ProductDetailModal'
import { apiUrl, ModelAsset, LODAssetCollection, saveRoom, FurnitureProduct } from '../services/api'
import { useAuth } from '../contexts/AuthContext'

interface ResultsPreviewProps {
  onReset: () => void
  depthResults: DepthEstimationResult[]
  originalFrames?: HTMLCanvasElement[]
  modelAsset?: ModelAsset | null
  lodAssets?: LODAssetCollection | null
  jobId?: string | null
}

export default function ResultsPreview({
  onReset,
  depthResults: _depthResults,
  originalFrames: _originalFrames = [],
  modelAsset = null,
  lodAssets = null,
  jobId = null,
}: ResultsPreviewProps) {
  // Note: _depthResults and _originalFrames are kept for potential future use
  void _depthResults;
  void _originalFrames;

  const { user } = useAuth()
  const navigate = useNavigate()

  // Furniture editing state
  const modelViewerRef = useRef<ModelViewerRef>(null)
  const [editMode, setEditMode] = useState(false)
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string | null>(null)
  const [furniture, setFurniture] = useState<PlacedFurniture[]>([])

  // Save room state
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [roomDescription, setRoomDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedSuccessfully, setSavedSuccessfully] = useState(false)

  // Furniture product modal state
  const [selectedProduct, setSelectedProduct] = useState<FurnitureProduct | null>(null)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)

  const handleProductSelect = useCallback((product: FurnitureProduct) => {
    setSelectedProduct(product)
    setIsProductModalOpen(true)
  }, [])

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

  const handleSaveRoom = async () => {
    if (!jobId || !roomName.trim()) return

    setIsSaving(true)
    setSaveError(null)

    try {
      await saveRoom({
        job_id: jobId,
        name: roomName.trim(),
        description: roomDescription.trim() || undefined,
      })
      setSavedSuccessfully(true)
      setShowSaveModal(false)
      setRoomName('')
      setRoomDescription('')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save room')
    } finally {
      setIsSaving(false)
    }
  }

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
    <div className="w-full max-w-7xl mx-auto">
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

      {/* Main Content: 3D Viewer + Furniture Search */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 3D Viewer - Takes 2/3 of the space on large screens */}
        <div className="lg:col-span-2">
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
                  enableFurnitureDetection={true}
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

          {/* Furniture Panel - Below the 3D viewer */}
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
        </div>

        {/* Furniture Search - Takes 1/3 of the space on large screens */}
        <div className="lg:col-span-1 opacity-0 animate-slide-up" style={{ animationDelay: '0.5s' }}>
          <div className="rounded-xl border border-border/50 bg-muted/30 p-5 sm:p-6 h-full">
            <FurnitureSearch onProductSelect={handleProductSelect} />
          </div>
        </div>
      </div>

      {/* Success Message */}
      {savedSuccessfully && (
        <div className="mt-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center justify-between opacity-0 animate-fade-in" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-green-500 font-medium">Room saved successfully!</span>
          </div>
          <button
            onClick={() => navigate('/my-rooms')}
            className="text-sm text-green-500 hover:text-green-400 font-medium underline"
          >
            View My Rooms
          </button>
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

        {/* Save Room Button - only show if user is logged in and has a jobId */}
        {user && jobId && !savedSuccessfully && (
          <button
            onClick={() => setShowSaveModal(true)}
            className="w-full sm:w-auto px-6 py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-all duration-300 btn-press flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
            </svg>
            Save Room
          </button>
        )}

        {/* Prompt to login if not authenticated */}
        {!user && jobId && (
          <button
            onClick={() => navigate('/login')}
            className="w-full sm:w-auto px-6 py-3 bg-muted hover:bg-accent text-foreground font-medium rounded-lg transition-all duration-300 border border-border btn-press flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            Login to Save
          </button>
        )}

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

      {/* Save Room Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-foreground">Save Room</h3>
              <button
                onClick={() => {
                  setShowSaveModal(false)
                  setSaveError(null)
                }}
                className="p-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="roomName" className="block text-sm font-medium text-foreground mb-1.5">
                  Room Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="roomName"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g., Living Room, Bedroom"
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label htmlFor="roomDescription" className="block text-sm font-medium text-foreground mb-1.5">
                  Description <span className="text-muted-foreground">(optional)</span>
                </label>
                <textarea
                  id="roomDescription"
                  value={roomDescription}
                  onChange={(e) => setRoomDescription(e.target.value)}
                  placeholder="Add notes about this room..."
                  rows={3}
                  className="w-full px-4 py-2.5 bg-muted border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand transition-all resize-none"
                />
              </div>

              {saveError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-sm text-red-500">{saveError}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowSaveModal(false)
                  setSaveError(null)
                }}
                className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent/80 text-foreground font-medium rounded-lg transition-colors"
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRoom}
                disabled={!roomName.trim() || isSaving}
                className="flex-1 px-4 py-2.5 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Room'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
      />
    </div>
  )
}
