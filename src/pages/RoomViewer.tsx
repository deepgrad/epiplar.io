import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getRoom, deleteRoom, updateRoom, Room, API_BASE_URL } from '../services/api'
import ModelViewer from '../components/ModelViewer'

export default function RoomViewer() {
  const { roomId } = useParams<{ roomId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [room, setRoom] = useState<Room | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit state
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Delete state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }

    const fetchRoom = async () => {
      if (!roomId) return

      setIsLoading(true)
      setError(null)

      try {
        const roomData = await getRoom(parseInt(roomId))
        setRoom(roomData)
        setEditName(roomData.name)
        setEditDescription(roomData.description || '')
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load room')
      } finally {
        setIsLoading(false)
      }
    }

    fetchRoom()
  }, [user, roomId, navigate])

  const handleSaveEdit = async () => {
    if (!room || !editName.trim()) return

    setIsSaving(true)
    try {
      const updated = await updateRoom(room.id, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      })
      setRoom(updated)
      setIsEditing(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update room')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!room) return

    setIsDeleting(true)
    try {
      await deleteRoom(room.id)
      navigate('/my-rooms')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room')
      setShowDeleteModal(false)
    } finally {
      setIsDeleting(false)
    }
  }

  // Get the best asset URL for the model viewer
  const getModelUrl = () => {
    if (!room?.assets?.length) return null

    // Prefer full > medium > preview
    const fullAsset = room.assets.find(a => a.lod_level === 'full')
    const mediumAsset = room.assets.find(a => a.lod_level === 'medium')
    const previewAsset = room.assets.find(a => a.lod_level === 'preview')
    const asset = fullAsset || mediumAsset || previewAsset || room.assets[0]

    return `${API_BASE_URL}${asset.url}`
  }

  const getDownloadAsset = () => {
    if (!room?.assets?.length) return null
    return room.assets.find(a => a.lod_level === 'full') ||
           room.assets.find(a => a.lod_level === 'medium') ||
           room.assets[0]
  }

  if (!user) return null

  if (isLoading) {
    return (
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="animate-pulse">
          <div className="h-8 bg-accent rounded w-1/3 mb-4" />
          <div className="aspect-video bg-accent rounded-xl mb-6" />
          <div className="h-4 bg-accent rounded w-1/2" />
        </div>
      </main>
    )
  }

  if (error || !room) {
    return (
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-12 w-full">
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-red-500/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Room Not Found</h2>
          <p className="text-sm text-muted-foreground mb-6">{error || 'The room you are looking for does not exist.'}</p>
          <Link
            to="/my-rooms"
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-colors"
          >
            Back to My Rooms
          </Link>
        </div>
      </main>
    )
  }

  const modelUrl = getModelUrl()
  const downloadAsset = getDownloadAsset()

  return (
    <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12 w-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link to="/my-rooms" className="hover:text-foreground transition-colors">
          My Rooms
        </Link>
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-foreground">{room.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        {isEditing ? (
          <div className="flex-1 space-y-3">
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand/50"
              placeholder="Room name"
              autoFocus
            />
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 resize-none"
              placeholder="Add a description..."
              rows={2}
            />
            <div className="flex gap-2">
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || isSaving}
                className="px-4 py-2 bg-brand hover:bg-brand-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setIsEditing(false)
                  setEditName(room.name)
                  setEditDescription(room.description || '')
                }}
                className="px-4 py-2 bg-accent hover:bg-accent/80 text-foreground text-sm font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-1">{room.name}</h1>
            {room.description && (
              <p className="text-sm text-muted-foreground">{room.description}</p>
            )}
          </div>
        )}

        {!isEditing && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(true)}
              className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
              title="Edit"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="p-2 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Delete"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 3D Viewer */}
      <div className="bg-muted/50 rounded-xl border border-border overflow-hidden mb-6">
        <div className="aspect-video relative">
          {modelUrl ? (
            <ModelViewer url={modelUrl} className="w-full h-full" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <p>No 3D model available</p>
            </div>
          )}
        </div>
      </div>

      {/* Room Info & Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Stats */}
        <div className="bg-muted/50 rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Room Details</h3>
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Created</span>
              <span className="text-foreground">
                {new Date(room.created_at).toLocaleDateString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">File Size</span>
              <span className="text-foreground">{room.file_size_display}</span>
            </div>
            {room.frame_count && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Frames</span>
                <span className="text-foreground">{room.frame_count}</span>
              </div>
            )}
            {room.point_count && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Points</span>
                <span className="text-foreground">{(room.point_count / 1000000).toFixed(2)}M</span>
              </div>
            )}
            {room.model_used && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Model</span>
                <span className="text-foreground">{room.model_used}</span>
              </div>
            )}
            {room.original_width && room.original_height && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Resolution</span>
                <span className="text-foreground">{room.original_width} x {room.original_height}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="bg-muted/50 rounded-xl border border-border p-5">
          <h3 className="text-sm font-medium text-foreground mb-4">Actions</h3>
          <div className="space-y-3">
            {downloadAsset && (
              <a
                href={`${API_BASE_URL}${downloadAsset.url}`}
                download={downloadAsset.filename}
                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-brand hover:bg-brand-500 text-white font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download GLB
                {downloadAsset.file_size_bytes && (
                  <span className="text-xs opacity-75">
                    ({(downloadAsset.file_size_bytes / (1024 * 1024)).toFixed(1)} MB)
                  </span>
                )}
              </a>
            )}
            <Link
              to="/"
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-accent hover:bg-accent/80 text-foreground font-medium rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Scan
            </Link>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md p-6 animate-scale-in">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground mb-1">Delete Room</h3>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete "{room.name}"? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 px-4 py-2.5 bg-accent hover:bg-accent/80 text-foreground font-medium rounded-lg transition-colors"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
