import { useState, useCallback, useRef } from 'react'
import VideoUpload from '../components/VideoUpload'
import ProcessingStatus from '../components/ProcessingStatus'
import ResultsPreview from '../components/ResultsPreview'
import FurnitureSearch from '../components/FurnitureSearch'
import ProductDetailModal from '../components/ProductDetailModal'
import { FurnitureProduct } from '../services/api'
import {
  DepthEstimationResult,
  ProcessingProgress,
  convertBackendResult,
  extractVideoFrames,
} from '../services/depthEstimation'
import {
  uploadVideo,
  startProcessing,
  connectProgressWebSocket,
  cancelJob,
  ModelAsset,
} from '../services/api'

type AppState = 'upload' | 'processing' | 'results' | 'error'

export default function Home() {
  const [appState, setAppState] = useState<AppState>('upload')
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null)
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null)
  const [depthResults, setDepthResults] = useState<DepthEstimationResult[]>([])
  const [originalFrames, setOriginalFrames] = useState<HTMLCanvasElement[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [modelAsset, setModelAsset] = useState<ModelAsset | null>(null)
  const [selectedProduct, setSelectedProduct] = useState<FurnitureProduct | null>(null)
  const [isProductModalOpen, setIsProductModalOpen] = useState(false)
  const jobIdRef = useRef<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const handleProductSelect = useCallback((product: FurnitureProduct) => {
    setSelectedProduct(product)
    setIsProductModalOpen(true)
  }, [])

  const handleVideoSelect = (file: File) => {
    setSelectedVideo(file)
    setErrorMessage(null)
  }

  const handleProcess = async () => {
    if (!selectedVideo) return

    setAppState('processing')
    setProcessingProgress({ stage: 'Uploading video', progress: 0 })
    setErrorMessage(null)

    try {
      setProcessingProgress({ stage: 'Uploading video', progress: 5 })
      const { jobId } = await uploadVideo(selectedVideo)
      jobIdRef.current = jobId

      const framesPromise = extractVideoFrames(selectedVideo, 8, 30)

      const ws = connectProgressWebSocket(
        jobId,
        (progress) => {
          setProcessingProgress({
            stage: progress.stage,
            progress: progress.progress,
            currentFrame: progress.current_frame,
            totalFrames: progress.total_frames,
            message: progress.message,
          })
        },
        async (result) => {
          const depthResults = convertBackendResult(result)
          const frames = await framesPromise

          setDepthResults(depthResults)
          setOriginalFrames(frames)
          setModelAsset(result.model_asset ?? null)
          setProcessingProgress({ stage: 'Complete', progress: 100 })

          setTimeout(() => {
            setAppState('results')
          }, 500)
        },
        (error) => {
          console.error('Processing error:', error)
          setErrorMessage(error.message)
          setAppState('error')
        }
      )
      wsRef.current = ws

      await startProcessing(jobId, { maxFrames: 16, frameInterval: 30 })

    } catch (error) {
      console.error('Processing error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred during processing')
      setAppState('error')
    }
  }

  const handleCancel = async () => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    if (jobIdRef.current) {
      try {
        await cancelJob(jobIdRef.current)
      } catch (e) {
        console.warn('Failed to cancel job:', e)
      }
      jobIdRef.current = null
    }

    setAppState('upload')
    setProcessingProgress(null)
  }

  const handleReset = useCallback(() => {
    setAppState('upload')
    setSelectedVideo(null)
    setDepthResults([])
    setOriginalFrames([])
    setProcessingProgress(null)
    setErrorMessage(null)
    setModelAsset(null)
    jobIdRef.current = null
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  return (
    <>
      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 lg:py-20 w-full">
        {appState === 'upload' && (
          <div>
            {/* Hero Section */}
            <div className="text-center mb-10 sm:mb-14 select-none">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brand/10 border border-brand/20 rounded-full text-xs font-medium text-brand-300 mb-6 opacity-0 animate-slide-down stagger-1">
                <span className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-pulse" />
                AI-Powered 3D Reconstruction
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-4 tracking-tight text-balance opacity-0 animate-slide-up stagger-2">
                Turn your room into 3D
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed opacity-0 animate-slide-up stagger-3">
                Upload a video of your room and our AI will create a precise 3D reconstruction in seconds.
              </p>
            </div>

            {/* Upload Section */}
            <div className="max-w-3xl mx-auto mb-6 opacity-0 animate-scale-in stagger-4">
              <div className="rounded-xl border border-border/50 bg-muted/30 p-5 sm:p-6 border-hover-glow">
                <VideoUpload onVideoSelect={handleVideoSelect} />
              </div>
            </div>

            {/* Process Button */}
            <div className="text-center mb-8 opacity-0 animate-fade-in stagger-5">
              <button
                onClick={handleProcess}
                disabled={!selectedVideo}
                className={`px-8 py-4 font-medium rounded-lg transition-all duration-300 text-sm sm:text-base btn-press
                           ${selectedVideo
                             ? 'bg-brand hover:bg-brand-500 text-white brand-glow btn-bounce'
                             : 'bg-accent text-muted-foreground cursor-not-allowed'
                           }`}
              >
                {selectedVideo ? 'Generate 3D Model' : 'Upload a video to begin'}
              </button>
              <p className="text-xs text-muted-foreground mt-3">
                Powered by Depth Anything V3
              </p>
            </div>

            {/* Furniture Search Section */}
            <div className="max-w-3xl mx-auto opacity-0 animate-scale-in stagger-6">
              <div className="rounded-xl border border-border/50 bg-muted/30 p-5 sm:p-6 border-hover-glow">
                <FurnitureSearch onProductSelect={handleProductSelect} />
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-16 sm:mt-20">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  ),
                  title: 'AI Depth Estimation',
                  description: 'State-of-the-art multi-view depth with spatial consistency.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  ),
                  title: '3D Point Cloud',
                  description: 'Interactive 3D visualization you can explore and export.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  ),
                  title: 'Export & Share',
                  description: 'Download your 3D model in multiple formats.',
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className={`group p-5 sm:p-6 rounded-xl bg-muted/50 border border-border/50 hover:border-brand/30 hover:bg-muted transition-all duration-300 hover-lift card-shine opacity-0 animate-slide-up`}
                  style={{ animationDelay: `${0.6 + index * 0.1}s` }}
                >
                  <div className="w-10 h-10 rounded-lg bg-accent text-muted-foreground group-hover:bg-brand/20 group-hover:text-brand-300 flex items-center justify-center mb-4 transition-all duration-300 icon-hover-bounce">
                    {feature.icon}
                  </div>
                  <h3 className="font-medium text-foreground mb-1.5 text-sm">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {appState === 'processing' && (
          <ProcessingStatus
            isProcessing={true}
            progress={processingProgress}
            onCancel={handleCancel}
          />
        )}

        {appState === 'results' && (
          <ResultsPreview
            onReset={handleReset}
            depthResults={depthResults}
            originalFrames={originalFrames}
            modelAsset={modelAsset}
            lodAssets={null}
            jobId={jobIdRef.current}
          />
        )}

        {appState === 'error' && (
          <div className="w-full max-w-xl mx-auto mt-8 animate-fade-in">
            <div className="bg-muted/50 rounded-xl border border-red-500/20 p-6 sm:p-8">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-medium text-foreground mb-1">Processing Error</h3>
                  <p className="text-sm text-muted-foreground">{errorMessage}</p>
                </div>
              </div>
              <div className="p-4 bg-accent/50 rounded-lg mb-6">
                <p className="text-sm font-medium text-foreground mb-2">Troubleshooting</p>
                <ul className="text-sm text-muted-foreground space-y-1.5">
                  <li>Use standard formats (MP4, WebM, MOV)</li>
                  <li>Keep videos under 30 seconds</li>
                  <li>Ensure good lighting conditions</li>
                </ul>
              </div>
              <button
                onClick={handleReset}
                className="w-full px-6 py-3 bg-foreground hover:bg-primary-200 text-background font-medium rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        isOpen={isProductModalOpen}
        onClose={() => setIsProductModalOpen(false)}
      />
    </>
  )
}
