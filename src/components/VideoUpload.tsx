import { useState, useRef, useCallback, useEffect } from 'react'

interface VideoUploadProps {
  onVideoSelect: (file: File) => void
}

type Mode = 'upload' | 'record'
type RecordingState = 'idle' | 'requesting' | 'ready' | 'recording' | 'stopped'

export default function VideoUpload({ onVideoSelect }: VideoUploadProps) {
  const [mode, setMode] = useState<Mode>('upload')
  const [isDragging, setIsDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  // Recording state
  const [recordingState, setRecordingState] = useState<RecordingState>('idle')
  const [recordingTime, setRecordingTime] = useState(0)
  const [cameraError, setCameraError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopCamera()
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setRecordingState('idle')
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files.length > 0 && files[0].type.startsWith('video/')) {
      handleFile(files[0])
    }
  }, [])

  const handleFile = (file: File) => {
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
    onVideoSelect(file)
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) {
      handleFile(files[0])
    }
  }

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const clearVideo = () => {
    setPreviewUrl(null)
    setRecordingState('idle')
    setRecordingTime(0)
    stopCamera()
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const switchMode = (newMode: Mode) => {
    if (newMode === mode) return
    clearVideo()
    setCameraError(null)
    setMode(newMode)
  }

  const requestCamera = async () => {
    setRecordingState('requesting')
    setCameraError(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Prefer back camera on mobile
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: true
      })

      streamRef.current = stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      setRecordingState('ready')
    } catch (err) {
      console.error('Camera access error:', err)
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setCameraError('Camera permission denied. Please allow camera access and try again.')
        } else if (err.name === 'NotFoundError') {
          setCameraError('No camera found. Please connect a camera and try again.')
        } else {
          setCameraError(`Camera error: ${err.message}`)
        }
      } else {
        setCameraError('Failed to access camera')
      }
      setRecordingState('idle')
    }
  }

  const startRecording = () => {
    if (!streamRef.current) return

    chunksRef.current = []

    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm'
    })

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' })
      const file = new File([blob], `recording-${Date.now()}.webm`, { type: 'video/webm' })
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      onVideoSelect(file)
      stopCamera()
    }

    mediaRecorderRef.current = mediaRecorder
    mediaRecorder.start(100) // Collect data every 100ms

    setRecordingState('recording')
    setRecordingTime(0)

    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1)
    }, 1000)
  }

  const stopRecording = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }

    setRecordingState('stopped')
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="w-full min-h-[340px] lg:min-h-[400px] flex flex-col">
      {/* Mode Toggle */}
      {!previewUrl && (
        <div className="flex justify-center mb-3">
          <div className="inline-flex rounded-lg bg-muted p-1 border border-border/50">
            <button
              onClick={() => switchMode('upload')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'upload'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Upload
              </span>
            </button>
            <button
              onClick={() => switchMode('record')}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                mode === 'record'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Record
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Upload Mode */}
      {mode === 'upload' && !previewUrl && (
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            group relative cursor-pointer rounded-xl border-2 border-dashed flex-1
            flex flex-col items-center justify-center
            transition-all duration-300 hover-lift
            ${isDragging
              ? 'border-brand bg-brand/10 scale-[1.02]'
              : 'border-border hover:border-brand/50 hover:bg-muted/30'
            }
          `}
        >
          <div className="flex flex-col items-center justify-center py-10 sm:py-14 px-6">
            <div className={`
              w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center mb-5
              transition-all duration-300
              ${isDragging ? 'bg-brand text-white scale-110' : 'bg-accent text-muted-foreground group-hover:bg-brand/20 group-hover:text-brand-300'}
            `}>
              <svg
                className="w-6 h-6 sm:w-7 sm:h-7"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>

            <h3 className="text-sm sm:text-base font-medium text-foreground mb-2 text-center">
              Drop your video here
            </h3>
            <p className="text-muted-foreground text-xs sm:text-sm text-center mb-3">
              or click to browse files
            </p>
            <p className="text-[10px] sm:text-xs text-muted-foreground/60">
              MP4, MOV, WebM
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileInput}
            className="hidden"
          />
        </div>
      )}

      {/* Record Mode */}
      {mode === 'record' && !previewUrl && (
        <div className="rounded-xl border border-border bg-muted/30 flex-1 flex flex-col overflow-hidden">
          {/* Camera Preview or Placeholder */}
          <div className="flex-1 relative bg-black/90 overflow-hidden min-h-[180px]">
            {recordingState === 'idle' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <div className="w-12 h-12 rounded-full bg-muted/80 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-xs">Click below to enable camera</p>
              </div>
            )}

            {recordingState === 'requesting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                <div className="w-6 h-6 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin mb-3" />
                <p className="text-xs">Requesting camera access...</p>
              </div>
            )}

            {cameraError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-red-400 p-4">
                <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-xs text-center max-w-[200px]">{cameraError}</p>
              </div>
            )}

            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={`w-full h-full object-cover ${
                recordingState === 'ready' || recordingState === 'recording' ? 'block' : 'hidden'
              }`}
            />

            {/* Recording indicator */}
            {recordingState === 'recording' && (
              <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 rounded-full">
                <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-white text-sm font-medium">{formatTime(recordingTime)}</span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="p-3 flex justify-center gap-3 bg-muted/50 border-t border-border/50">
            {recordingState === 'idle' && !cameraError && (
              <button
                onClick={requestCamera}
                className="px-5 py-2 bg-brand hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Enable Camera
              </button>
            )}

            {cameraError && (
              <button
                onClick={requestCamera}
                className="px-5 py-2 bg-accent hover:bg-accent/80 text-foreground text-sm font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try Again
              </button>
            )}

            {recordingState === 'ready' && (
              <>
                <button
                  onClick={stopCamera}
                  className="px-4 py-2 bg-accent hover:bg-accent/80 text-foreground text-sm font-medium rounded-lg transition-all duration-300"
                >
                  Cancel
                </button>
                <button
                  onClick={startRecording}
                  className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
                >
                  <span className="w-2.5 h-2.5 bg-white rounded-full" />
                  Start Recording
                </button>
              </>
            )}

            {recordingState === 'recording' && (
              <button
                onClick={stopRecording}
                className="px-5 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-all duration-300 flex items-center gap-2"
              >
                <span className="w-2.5 h-2.5 bg-white rounded-sm" />
                Stop Recording
              </button>
            )}
          </div>
        </div>
      )}

      {/* Preview (for both modes) */}
      {previewUrl && (
        <div className="relative rounded-xl overflow-hidden bg-muted border border-border animate-scale-in flex-1">
          <video
            src={previewUrl}
            controls
            className="w-full h-full object-contain bg-black"
            playsInline
          />
          <button
            onClick={clearVideo}
            className="absolute top-3 right-3 w-9 h-9 rounded-lg bg-background/80 hover:bg-background
                       text-muted-foreground hover:text-foreground flex items-center justify-center
                       transition-all duration-200 border border-border/50 hover:scale-110"
            aria-label="Remove video"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          {mode === 'record' && (
            <div className="absolute top-3 left-3 px-2 py-1 bg-background/80 rounded text-xs text-muted-foreground">
              Recorded video
            </div>
          )}
        </div>
      )}
    </div>
  )
}
