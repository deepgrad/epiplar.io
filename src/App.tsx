import { useState, useCallback, useRef } from 'react'
import VideoUpload from './components/VideoUpload'
import ProcessingStatus from './components/ProcessingStatus'
import ResultsPreview from './components/ResultsPreview'
import {
  DepthEstimationResult,
  ProcessingProgress,
  convertBackendResult,
  extractVideoFrames,
  CameraParameters,
} from './services/depthEstimation'
import {
  uploadVideo,
  startProcessing,
  connectProgressWebSocket,
  cancelJob,
} from './services/api'

type AppState = 'upload' | 'processing' | 'results' | 'error'

function App() {
  const [appState, setAppState] = useState<AppState>('upload')
  const [selectedVideo, setSelectedVideo] = useState<File | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [processingProgress, setProcessingProgress] = useState<ProcessingProgress | null>(null)
  const [depthResults, setDepthResults] = useState<DepthEstimationResult[]>([])
  const [originalFrames, setOriginalFrames] = useState<HTMLCanvasElement[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [cameraParams, setCameraParams] = useState<CameraParameters | null>(null)
  const jobIdRef = useRef<string | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

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
      // 1. Upload video to backend
      setProcessingProgress({ stage: 'Uploading video', progress: 5 })
      const { jobId } = await uploadVideo(selectedVideo)
      jobIdRef.current = jobId

      // 2. Extract frames locally for color preview (parallel with backend processing)
      const framesPromise = extractVideoFrames(selectedVideo, 8, 30)

      // 3. Connect WebSocket for progress updates
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
          // Processing complete
          const depthResults = convertBackendResult(result)
          const frames = await framesPromise

          setDepthResults(depthResults)
          setOriginalFrames(frames)
          setCameraParams(result.camera_params)
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

      // 4. Start processing on backend
      await startProcessing(jobId, { maxFrames: 8, frameInterval: 30 })

    } catch (error) {
      console.error('Processing error:', error)
      setErrorMessage(error instanceof Error ? error.message : 'An error occurred during processing')
      setAppState('error')
    }
  }

  const handleCancel = async () => {
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }

    // Cancel job on backend
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
    setCameraParams(null)
    jobIdRef.current = null
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
              <svg className="w-5 h-5 sm:w-6 sm:h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
            </div>
            <span className="text-lg sm:text-xl font-semibold text-slate-800">Garaza</span>
          </div>

          <nav className="hidden md:flex items-center gap-6 lg:gap-8">
            <a href="#" className="text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors">How it works</a>
            <a href="#" className="text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors">Examples</a>
            <a href="#" className="text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors">Pricing</a>
          </nav>

          <div className="hidden sm:flex items-center gap-2 sm:gap-3">
            <button className="text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors px-3 py-2">
              Sign in
            </button>
            <button className="px-3 sm:px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors">
              Get started
            </button>
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden p-2 -mr-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-slate-200 bg-white">
            <nav className="flex flex-col px-4 py-3 space-y-1">
              <a href="#" className="text-slate-600 hover:text-slate-800 hover:bg-slate-50 text-sm font-medium transition-colors px-3 py-3 rounded-lg">How it works</a>
              <a href="#" className="text-slate-600 hover:text-slate-800 hover:bg-slate-50 text-sm font-medium transition-colors px-3 py-3 rounded-lg">Examples</a>
              <a href="#" className="text-slate-600 hover:text-slate-800 hover:bg-slate-50 text-sm font-medium transition-colors px-3 py-3 rounded-lg">Pricing</a>
            </nav>
            <div className="flex flex-col px-4 pb-4 pt-2 space-y-2 border-t border-slate-100">
              <button className="text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors px-3 py-3 rounded-lg hover:bg-slate-50 text-left">
                Sign in
              </button>
              <button className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg transition-colors w-full">
                Get started
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        {appState === 'upload' && (
          <>
            {/* Hero Section */}
            <div className="text-center mb-8 sm:mb-12">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary-100 text-primary-700 rounded-full text-xs font-medium mb-4 sm:mb-6">
                <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
                AI-Powered 3D Room Scanning
              </div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-slate-900 mb-3 sm:mb-4 text-balance px-2">
                Turn your room into 3D
              </h1>
              <p className="text-base sm:text-lg text-slate-500 max-w-2xl mx-auto px-2">
                Upload a video of your room and our AI will create a 3D reconstruction
                using Depth Anything V3 technology.
              </p>
            </div>

            {/* Upload Section */}
            <VideoUpload onVideoSelect={handleVideoSelect} />

            {/* Process Button */}
            <div className="text-center mt-6 sm:mt-8 px-4 sm:px-0">
              <button
                onClick={handleProcess}
                disabled={!selectedVideo}
                className={`w-full sm:w-auto px-6 sm:px-8 py-3.5 sm:py-4 font-semibold rounded-xl
                           shadow-lg transition-all duration-300
                           active:scale-[0.98] text-sm sm:text-base min-h-[48px]
                           ${selectedVideo
                             ? 'bg-primary-500 hover:bg-primary-600 text-white shadow-primary-500/25 hover:shadow-primary-500/40'
                             : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                           }`}
              >
                {selectedVideo ? 'Generate 3D Room Model' : 'Upload a video first'}
              </button>
              <p className="text-xs sm:text-sm text-slate-400 mt-3">
                Powered by Depth Anything V3 AI
              </p>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-12 sm:mt-16 lg:mt-20">
              {[
                {
                  icon: (
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  ),
                  title: 'AI Depth Estimation',
                  description: 'State-of-the-art Depth Anything V3 with multi-view consistency for superior depth accuracy.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                  ),
                  title: '3D Point Cloud',
                  description: 'Convert depth maps into interactive 3D point clouds you can explore.',
                },
                {
                  icon: (
                    <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  ),
                  title: 'Export & Share',
                  description: 'Download your 3D room data for use in other applications.',
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="p-5 sm:p-6 rounded-xl sm:rounded-2xl bg-white border border-slate-200 hover:border-primary-200 hover:shadow-md transition-all duration-300"
                >
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center mb-3 sm:mb-4">
                    {feature.icon}
                  </div>
                  <h3 className="font-semibold text-slate-800 mb-1.5 sm:mb-2 text-sm sm:text-base">{feature.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">{feature.description}</p>
                </div>
              ))}
            </div>
          </>
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
          />
        )}

        {appState === 'error' && (
          <div className="w-full max-w-2xl mx-auto mt-8">
            <div className="bg-white rounded-2xl border border-red-200 p-8 shadow-sm">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Processing Error</h3>
                  <p className="text-sm text-slate-500">{errorMessage}</p>
                </div>
              </div>
              <div className="p-4 bg-slate-50 rounded-xl mb-6">
                <p className="text-sm text-slate-600">
                  <strong>Tips:</strong>
                </p>
                <ul className="text-sm text-slate-600 list-disc list-inside mt-2 space-y-1">
                  <li>Make sure your video is a standard format (MP4, WebM, MOV)</li>
                  <li>Try a shorter video (under 30 seconds works best)</li>
                  <li>Ensure good lighting in your room video</li>
                  <li>Try refreshing the page and uploading again</li>
                </ul>
              </div>
              <button
                onClick={handleReset}
                className="w-full px-6 py-3 bg-primary-500 hover:bg-primary-600 text-white font-medium rounded-xl transition-colors"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 mt-12 sm:mt-16 lg:mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs sm:text-sm text-slate-500 text-center sm:text-left">
              2025 Garaza. Powered by Depth Anything V3.
            </p>
            <div className="flex items-center gap-4 sm:gap-6">
              <a href="#" className="text-xs sm:text-sm text-slate-500 hover:text-slate-700 transition-colors py-1">Privacy</a>
              <a href="#" className="text-xs sm:text-sm text-slate-500 hover:text-slate-700 transition-colors py-1">Terms</a>
              <a href="#" className="text-xs sm:text-sm text-slate-500 hover:text-slate-700 transition-colors py-1">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
