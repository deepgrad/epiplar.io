import { FurnitureReplacementResult } from '../services/api'

interface ReplacementPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  result: FurnitureReplacementResult | null
  isLoading: boolean
  error: string | null
  onRetry: () => void
  productName: string
}

export default function ReplacementPreviewModal({
  isOpen,
  onClose,
  result,
  isLoading,
  error,
  onRetry,
  productName,
}: ReplacementPreviewModalProps) {
  if (!isOpen) return null

  // Handle download of the generated image
  const handleDownload = () => {
    if (!result?.generated_image_base64) return

    try {
      // Convert base64 to blob
      const base64Data = result.generated_image_base64.replace(/^data:image\/\w+;base64,/, '')
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/png' })

      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `furniture-replacement-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to download image:', err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-3xl max-h-[90vh] bg-card border border-border rounded-2xl shadow-2xl overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Furniture Replacement Preview</h2>
            {productName && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Replacing with: {productName}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-accent/50 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Loading State */}
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              {/* Animated spinner */}
              <div className="relative w-20 h-20 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-brand/20"></div>
                <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-brand animate-spin"></div>
                <div className="absolute inset-3 rounded-full border-4 border-brand/10"></div>
                <div className="absolute inset-3 rounded-full border-4 border-transparent border-t-brand-400 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '0.8s' }}></div>
              </div>

              <h3 className="text-lg font-semibold text-foreground mb-2">Generating Preview</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                Our AI is creating a preview of your room with the new furniture. This may take a moment...
              </p>

              {/* Pulsing progress bar */}
              <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-600 via-brand-400 to-brand-600 animate-pulse rounded-full" style={{ width: '100%' }}></div>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              {/* Error icon */}
              <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-6">
                <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>

              <h3 className="text-lg font-semibold text-foreground mb-2">Generation Failed</h3>
              <p className="text-sm text-muted-foreground text-center max-w-sm mb-6">
                {error}
              </p>

              <button
                onClick={onRetry}
                className="px-6 py-2.5 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-all duration-300 btn-press flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Try Again
              </button>
            </div>
          )}

          {/* Success State - Image Display */}
          {result && !isLoading && !error && (
            <div className="p-6">
              {/* Generated Image */}
              <div className="relative rounded-xl overflow-hidden bg-muted mb-4">
                <img
                  src={result.generated_image_base64.startsWith('data:')
                    ? result.generated_image_base64
                    : `data:image/png;base64,${result.generated_image_base64}`}
                  alt="AI-generated furniture replacement preview"
                  className="w-full h-auto object-contain"
                />

                {/* Generation info overlay */}
                {result.generation_time_seconds && (
                  <div className="absolute bottom-3 left-3 px-3 py-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-xs text-white/80">
                    Generated in {result.generation_time_seconds.toFixed(1)}s
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleDownload}
                  className="flex-1 py-3 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-all duration-300 btn-press flex items-center justify-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download Image
                </button>
                <button
                  onClick={onRetry}
                  className="px-6 py-3 bg-accent hover:bg-accent/80 text-foreground font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Regenerate
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
