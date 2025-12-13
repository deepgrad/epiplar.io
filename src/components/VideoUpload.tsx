import { useState, useRef, useCallback } from 'react'

interface VideoUploadProps {
  onVideoSelect: (file: File) => void
}

export default function VideoUpload({ onVideoSelect }: VideoUploadProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-4 sm:px-0">
      {!previewUrl ? (
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative cursor-pointer rounded-xl sm:rounded-2xl border-2 border-dashed
            transition-all duration-300 ease-out
            ${isDragging
              ? 'border-primary-500 bg-primary-50 scale-[1.01] sm:scale-[1.02]'
              : 'border-slate-200 bg-slate-50 hover:border-primary-300 hover:bg-slate-100 active:bg-slate-100'
            }
          `}
        >
          <div className="flex flex-col items-center justify-center py-10 sm:py-14 md:py-16 px-4 sm:px-6">
            <div className={`
              w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center mb-4 sm:mb-6
              transition-all duration-300
              ${isDragging ? 'bg-primary-500 text-white' : 'bg-slate-200 text-slate-500'}
            `}>
              <svg
                className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8"
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

            <h3 className="text-base sm:text-lg font-semibold text-slate-800 mb-1.5 sm:mb-2 text-center">
              Upload your room video
            </h3>
            <p className="text-slate-500 text-xs sm:text-sm text-center max-w-sm mb-3 sm:mb-4 px-2">
              Drag and drop your video here, or tap to browse
            </p>
            <p className="text-[10px] sm:text-xs text-slate-400">
              Supports MP4, MOV, WebM up to 500MB
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
      ) : (
        <div className="relative rounded-xl sm:rounded-2xl overflow-hidden bg-slate-900">
          <video
            src={previewUrl}
            controls
            className="w-full aspect-video object-contain"
            playsInline
          />
          <button
            onClick={clearVideo}
            className="absolute top-2 right-2 sm:top-4 sm:right-4 w-10 h-10 sm:w-10 sm:h-10 min-w-[44px] min-h-[44px] rounded-full bg-black/50 hover:bg-black/70 active:bg-black/80
                       text-white flex items-center justify-center transition-colors"
            aria-label="Remove video"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
