import { ProcessingProgress } from '../services/depthEstimation'

interface ProcessingStatusProps {
  isProcessing: boolean
  progress: ProcessingProgress | null
  onCancel?: () => void
}

const stages = [
  { id: 1, label: 'Uploading video', key: 'Uploading video' },
  { id: 2, label: 'Extracting frames', key: 'Extracting frames' },
  { id: 3, label: 'Loading DA3 model', key: 'Loading model' },
  { id: 4, label: 'Processing depth', key: 'Processing depth' },
  { id: 5, label: 'Complete', key: 'Complete' },
]

function getCurrentStageIndex(stageName: string): number {
  const index = stages.findIndex(s => s.key === stageName)
  return index >= 0 ? index : 0
}

export default function ProcessingStatus({ isProcessing, progress, onCancel }: ProcessingStatusProps) {
  const currentStage = progress ? getCurrentStageIndex(progress.stage) : 0
  const overallProgress = progress?.progress ?? 0

  if (!isProcessing && overallProgress === 0) return null

  return (
    <div className="w-full max-w-xl mx-auto animate-scale-in">
      <div className="bg-muted/50 rounded-xl border border-border p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-brand/20 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-brand-300 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="3"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Creating your 3D model
              </h3>
              <p className="text-sm text-muted-foreground">
                {progress?.stage || 'Initializing...'}
                {progress?.currentFrame && progress?.totalFrames && (
                  <span className="ml-1.5 text-brand-300">
                    ({progress.currentFrame}/{progress.totalFrames} frames)
                  </span>
                )}
              </p>
            </div>
          </div>
          <span className="text-3xl font-bold text-foreground tabular-nums">
            {Math.round(overallProgress)}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-accent rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-gradient-to-r from-brand to-brand-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Stages */}
        <div className="space-y-3">
          {stages.slice(0, -1).map((stage, index) => (
            <div
              key={stage.id}
              className={`
                flex items-center gap-3 text-sm transition-all duration-300
                ${index < currentStage
                  ? 'text-muted-foreground'
                  : index === currentStage
                    ? 'text-foreground'
                    : 'text-muted-foreground/40'
                }
              `}
            >
              <div className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                transition-all duration-300
                ${index < currentStage
                  ? 'bg-green-500/20 text-green-500'
                  : index === currentStage
                    ? 'bg-brand text-white'
                    : 'bg-accent text-muted-foreground/40'
                }
              `}>
                {index < currentStage ? (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stage.id
                )}
              </div>
              <span className={index === currentStage ? 'font-medium' : ''}>
                {stage.label}
              </span>
              {index === currentStage && (
                <div className="flex gap-1 ml-auto">
                  <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand rounded-full animate-pulse" style={{ animationDelay: '400ms' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Cancel button */}
        {onCancel && (
          <div className="mt-6 pt-6 border-t border-border">
            <button
              onClick={onCancel}
              className="w-full px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground
                         hover:bg-accent rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
