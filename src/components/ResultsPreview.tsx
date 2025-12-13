import { useState, useMemo } from 'react'
import { DepthEstimationResult, depthToPointCloud } from '../services/depthEstimation'
import PointCloudViewer from './PointCloudViewer'
import DepthMapViewer from './DepthMapViewer'

interface ResultsPreviewProps {
  onReset: () => void
  depthResults: DepthEstimationResult[]
  originalFrames?: HTMLCanvasElement[]
}

type ViewMode = '3d' | 'depth' | 'combined'

export default function ResultsPreview({ onReset, depthResults, originalFrames = [] }: ResultsPreviewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('3d')
  const [selectedFrameIndex, setSelectedFrameIndex] = useState(0)

  // Generate point cloud data from the selected frame
  const pointCloudData = useMemo(() => {
    if (depthResults.length === 0) return null

    const selectedResult = depthResults[selectedFrameIndex] || depthResults[0]
    const selectedFrame = originalFrames[selectedFrameIndex]

    // Get RGB data if available
    let rgbData: Uint8ClampedArray | undefined
    if (selectedFrame) {
      const ctx = selectedFrame.getContext('2d')
      if (ctx) {
        const imageData = ctx.getImageData(0, 0, selectedFrame.width, selectedFrame.height)
        rgbData = imageData.data
      }
    }

    return depthToPointCloud(selectedResult, rgbData)
  }, [depthResults, originalFrames, selectedFrameIndex])

  // Combined point cloud from multiple frames
  const combinedPointCloudData = useMemo(() => {
    if (depthResults.length < 2) return pointCloudData

    // Combine first few frames for a denser point cloud
    const maxFramesToCombine = Math.min(5, depthResults.length)
    const allPositions: number[] = []
    const allColors: number[] = []

    for (let i = 0; i < maxFramesToCombine; i++) {
      const result = depthResults[i]
      const frame = originalFrames[i]

      let rgbData: Uint8ClampedArray | undefined
      if (frame) {
        const ctx = frame.getContext('2d')
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, frame.width, frame.height)
          rgbData = imageData.data
        }
      }

      const { positions, colors } = depthToPointCloud(result, rgbData, 500, 10000)

      // Add offset for each frame to simulate camera movement
      const offsetZ = i * 0.5
      for (let j = 0; j < positions.length; j += 3) {
        allPositions.push(positions[j], positions[j + 1], positions[j + 2] - offsetZ)
        allColors.push(colors[j], colors[j + 1], colors[j + 2])
      }
    }

    return {
      positions: new Float32Array(allPositions),
      colors: new Float32Array(allColors),
    }
  }, [depthResults, originalFrames, pointCloudData])

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
          Analyzed {depthResults.length} frames using Depth Anything V2
        </p>
      </div>

      {/* View Mode Tabs */}
      <div className="flex justify-center mb-6">
        <div className="inline-flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setViewMode('3d')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              viewMode === '3d'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            3D Point Cloud
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
          {depthResults.length > 1 && (
            <button
              onClick={() => setViewMode('combined')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                viewMode === 'combined'
                  ? 'bg-white text-slate-800 shadow-sm'
                  : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Combined View
            </button>
          )}
        </div>
      </div>

      {/* Main Visualization */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {viewMode === '3d' && pointCloudData && (
          <div className="aspect-video">
            <PointCloudViewer
              positions={pointCloudData.positions}
              colors={pointCloudData.colors}
              className="w-full h-full"
            />
          </div>
        )}

        {viewMode === 'depth' && (
          <DepthMapViewer
            depthResults={depthResults}
            originalFrames={originalFrames}
          />
        )}

        {viewMode === 'combined' && combinedPointCloudData && (
          <div className="aspect-video">
            <PointCloudViewer
              positions={combinedPointCloudData.positions}
              colors={combinedPointCloudData.colors}
              className="w-full h-full"
            />
          </div>
        )}
      </div>

      {/* Frame Selection (for 3D view) */}
      {viewMode === '3d' && depthResults.length > 1 && (
        <div className="mt-4 bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-slate-700">Select Frame</span>
            <span className="text-sm text-slate-500">
              Frame {selectedFrameIndex + 1} of {depthResults.length}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {depthResults.map((_, index) => (
              <button
                key={index}
                onClick={() => setSelectedFrameIndex(index)}
                className={`flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center text-sm font-medium transition-colors ${
                  selectedFrameIndex === index
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-primary-600">{depthResults.length}</p>
          <p className="text-sm text-slate-500">Frames Analyzed</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-primary-600">
            {pointCloudData ? Math.floor(pointCloudData.positions.length / 3).toLocaleString() : 0}
          </p>
          <p className="text-sm text-slate-500">3D Points</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-primary-600">
            {depthResults[0]?.width}x{depthResults[0]?.height}
          </p>
          <p className="text-sm text-slate-500">Resolution</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">DA2</p>
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
        <button
          onClick={() => {
            // Export point cloud data as JSON
            if (pointCloudData) {
              const data = {
                positions: Array.from(pointCloudData.positions),
                colors: Array.from(pointCloudData.colors),
                frameCount: depthResults.length,
                resolution: {
                  width: depthResults[0]?.width,
                  height: depthResults[0]?.height,
                },
              }
              const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = 'room-pointcloud.json'
              a.click()
              URL.revokeObjectURL(url)
            }
          }}
          className="w-full sm:w-auto px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors"
        >
          Export Point Cloud
        </button>
      </div>

      {/* Info */}
      <p className="text-center text-sm text-slate-400 mt-6">
        Powered by Depth Anything V2 - Monocular Depth Estimation
      </p>
    </div>
  )
}
