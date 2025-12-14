import { useState } from 'react'
import { Room, API_BASE_URL } from '../services/api'

interface RoomCardProps {
  room: Room
  onView: (room: Room) => void
  onDelete: (room: Room) => void
  style?: React.CSSProperties
}

export default function RoomCard({ room, onView, onDelete, style }: RoomCardProps) {
  const [imageError, setImageError] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)

  const thumbnailUrl = room.thumbnail_url
    ? `${API_BASE_URL}${room.thumbnail_url}`
    : null

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`

    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    })
  }

  return (
    <div
      className="group bg-muted/50 rounded-xl border border-border overflow-hidden hover:border-brand/30 transition-all duration-300 hover-lift opacity-0 animate-fade-in"
      style={style}
    >
      {/* Thumbnail */}
      <div
        className="aspect-video relative bg-accent cursor-pointer overflow-hidden"
        onClick={() => onView(room)}
      >
        {thumbnailUrl && !imageError ? (
          <>
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
              </div>
            )}
            <img
              src={thumbnailUrl}
              alt={room.name}
              className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${
                imageLoading ? 'opacity-0' : 'opacity-100'
              }`}
              onLoad={() => setImageLoading(false)}
              onError={() => {
                setImageError(true)
                setImageLoading(false)
              }}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg className="w-12 h-12 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
        )}

        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
          <span className="px-4 py-2 bg-white/90 text-gray-900 text-sm font-medium rounded-lg">
            View Room
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3
            className="font-medium text-foreground truncate cursor-pointer hover:text-brand transition-colors"
            onClick={() => onView(room)}
          >
            {room.name}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(room)
            }}
            className="p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
            title="Delete room"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        {room.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
            {room.description}
          </p>
        )}

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{formatDate(room.created_at)}</span>
          <span>{room.file_size_display}</span>
        </div>

        {/* Stats */}
        {(room.frame_count || room.point_count) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
            {room.frame_count && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {room.frame_count} frames
              </div>
            )}
            {room.point_count && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                {(room.point_count / 1000000).toFixed(1)}M pts
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
