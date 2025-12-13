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
    <div className="w-full max-w-2xl mx-auto mt-6 sm:mt-8 px-4 sm:px-0">
      <div className="bg-white rounded-xl sm:rounded-2xl border border-slate-200 p-5 sm:p-6 md:p-8 shadow-sm">
        <div className="flex items-start sm:items-center gap-3 sm:gap-4 mb-5 sm:mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-primary-100 flex items-center justify-center flex-shrink-0">
            <svg
              className="w-5 h-5 sm:w-6 sm:h-6 text-primary-600 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base sm:text-lg font-semibold text-slate-800">
              Analyzing your room
            </h3>
            <p className="text-xs sm:text-sm text-slate-500">
              {progress?.stage || 'Initializing...'}
              {progress?.currentFrame && progress?.totalFrames && (
                <span className="ml-2 text-primary-600">
                  (Frame {progress.currentFrame}/{progress.totalFrames})
                </span>
              )}
            </p>
          </div>
          <span className="text-xl sm:text-2xl font-semibold text-primary-600 flex-shrink-0">
            {Math.round(overallProgress)}%
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-1.5 sm:h-2 bg-slate-100 rounded-full overflow-hidden mb-5 sm:mb-6">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${overallProgress}%` }}
          />
        </div>

        {/* Stages */}
        <div className="space-y-2.5 sm:space-y-3">
          {stages.slice(0, -1).map((stage, index) => (
            <div
              key={stage.id}
              className={`
                flex items-center gap-2.5 sm:gap-3 text-xs sm:text-sm transition-all duration-300
                ${index < currentStage
                  ? 'text-slate-800'
                  : index === currentStage
                    ? 'text-primary-600'
                    : 'text-slate-400'
                }
              `}
            >
              <div className={`
                w-5 h-5 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-medium flex-shrink-0
                transition-all duration-300
                ${index < currentStage
                  ? 'bg-green-500 text-white'
                  : index === currentStage
                    ? 'bg-primary-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }
              `}>
                {index < currentStage ? (
                  <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stage.id
                )}
              </div>
              <span className={`${index === currentStage ? 'font-medium' : ''} truncate`}>
                {stage.label}
              </span>
              {index === currentStage && (
                <div className="flex gap-1 ml-auto flex-shrink-0">
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-primary-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info box */}
        <div className="mt-5 sm:mt-6 p-3 sm:p-4 bg-blue-50 rounded-lg sm:rounded-xl border border-blue-100">
          <div className="flex items-start gap-2 sm:gap-3">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-xs sm:text-sm">
              <p className="font-medium text-blue-800 mb-0.5 sm:mb-1">Using Depth Anything V3</p>
              <p className="text-blue-600">
                Multi-view depth estimation with camera pose recovery for spatially consistent 3D reconstruction.
              </p>
            </div>
          </div>
        </div>

        {/* Cancel button */}
        {onCancel && (
          <div className="mt-5 sm:mt-6 text-center">
            <button
              onClick={onCancel}
              className="px-4 py-2 text-xs sm:text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancel processing
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
