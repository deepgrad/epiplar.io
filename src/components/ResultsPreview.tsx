import { useEffect, useMemo, useState } from 'react'
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
type ModelRenderMode = 'glb' | 'ply'

export default function ResultsPreview({
  onReset,
  depthResults,
  originalFrames = [],
  modelAsset = null,
}: ResultsPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('model')
  const [modelRenderMode, setModelRenderMode] = useState<ModelRenderMode>('glb')

  const modelAssetFormat = (modelAsset?.format || '').toLowerCase()
  const modelAssetUrl = modelAsset?.url || ''
  const isPlyAsset = modelAssetFormat === 'ply'

  // Parse job id from /api/assets/{jobId}/...
  const jobIdFromAssetUrl = useMemo(() => {
    const match = modelAssetUrl.match(/\/api\/assets\/([^/]+)\//)
    return match?.[1] || null
  }, [modelAssetUrl])

  const glbCandidateUrl = useMemo(() => {
    if (!jobIdFromAssetUrl) return null
    return apiUrl(`/api/assets/${jobIdFromAssetUrl}/scene.glb`)
  }, [jobIdFromAssetUrl])

  // Default: if backend returned PLY, prefer showing GLB first (often sharper / more recognizable)
  useEffect(() => {
    if (isPlyAsset && glbCandidateUrl) setModelRenderMode('glb')
    else setModelRenderMode('ply')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelAssetUrl])

  if (depthResults.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto mt-8 text-center">
        <p className="text-slate-500">No depth data available</p>
        <button
          onClick={onReset}
          className="mt-4 px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl font-medium transition-colors"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl mx-auto mt-6 sm:mt-8 px-4 sm:px-0">
      {/* Success Header */}
      <div className="text-center mb-6 sm:mb-8">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-full text-sm font-medium mb-4">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Processing complete
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-2">
          Your 3D Room Reconstruction
        </h2>
        <p className="text-sm sm:text-base text-slate-500">
          Fused {depthResults.length} frames into a single 3D model using Depth Anything 3
        </p>
      </div>

      {/* View Mode Tabs */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('model')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewMode === 'model'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            3D Model
          </button>
          <button
            onClick={() => setViewMode('depth')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewMode === 'depth'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            Depth Maps
          </button>
        </div>
      </div>

      {/* Main Visualization */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {viewMode === 'model' && (
          <div className="aspect-video relative">
            {modelAsset?.url ? (
              <>
                {/* Toggle between GLB and PLY when backend returned a splat PLY */}
                {isPlyAsset && glbCandidateUrl && (
                  <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
                    <button
                      onClick={() => setModelRenderMode('glb')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-sm border transition-colors ${
                        modelRenderMode === 'glb'
                          ? 'bg-white/90 text-slate-900 border-white/50'
                          : 'bg-black/30 text-white border-white/10 hover:bg-black/40'
                      }`}
                      type="button"
                    >
                      Point Cloud (GLB)
                    </button>
                    <button
                      onClick={() => setModelRenderMode('ply')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-sm border transition-colors ${
                        modelRenderMode === 'ply'
                          ? 'bg-white/90 text-slate-900 border-white/50'
                          : 'bg-black/30 text-white border-white/10 hover:bg-black/40'
                      }`}
                      type="button"
                    >
                      Gaussian Splats (PLY)
                    </button>
                  </div>
                )}

                {isPlyAsset ? (
                  modelRenderMode === 'glb' && glbCandidateUrl ? (
                    <ModelViewer url={glbCandidateUrl} className="w-full h-full" />
                  ) : (
                    <SplatViewer url={apiUrl(modelAsset.url)} className="w-full h-full" />
                  )
                ) : (
                  <ModelViewer url={apiUrl(modelAsset.url)} className="w-full h-full" />
                )}
              </>
            ) : (
              <div className="w-full h-full min-h-[300px] flex items-center justify-center text-slate-500">
                No 3D model was generated for this run.
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-primary-600">{depthResults.length}</p>
          <p className="text-sm text-slate-500">Frames Analyzed</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-primary-600">
            {modelAsset?.format?.toUpperCase?.() || '—'}
          </p>
          <p className="text-sm text-slate-500">Model Format</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-primary-600">
            {depthResults[0]?.width}x{depthResults[0]?.height}
          </p>
          <p className="text-sm text-slate-500">Resolution</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">DA3</p>
          <p className="text-sm text-slate-500">Model Used</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
        <button
          onClick={onReset}
          className="w-full sm:w-auto px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl transition-colors"
        >
          Process Another Video
        </button>
        {modelAsset?.url && (
          <a
            href={
              isPlyAsset && modelRenderMode === 'glb' && glbCandidateUrl
                ? glbCandidateUrl
                : apiUrl(modelAsset.url)
            }
            className="w-full sm:w-auto px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors text-center"
            download={
              isPlyAsset && modelRenderMode === 'glb'
                ? 'scene.glb'
                : (modelAsset.filename || undefined)
            }
          >
            Download 3D Model
          </a>
        )}
      </div>

      {/* Info */}
      <p className="text-center text-sm text-slate-400 mt-6">
        Powered by Depth Anything 3 - Multi-view depth + fusion
      </p>
    </div>
  )
}
