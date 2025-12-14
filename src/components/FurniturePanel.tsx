import { useState, useRef, useCallback } from 'react';
import { PlacedFurniture, ModelViewerRef } from './ModelViewer';

interface FurniturePanelProps {
  viewerRef: React.RefObject<ModelViewerRef | null>;
  editMode: boolean;
  onEditModeChange: (enabled: boolean) => void;
  selectedFurnitureId: string | null;
  furniture: PlacedFurniture[];
  className?: string;
  defaultCollapsed?: boolean;
}

export default function FurniturePanel({
  viewerRef,
  editMode,
  onEditModeChange,
  selectedFurnitureId,
  furniture,
  className = '',
  defaultCollapsed = true,
}: FurniturePanelProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle file upload
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !viewerRef.current) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.glb') && !file.name.toLowerCase().endsWith('.gltf')) {
      setError('Please select a GLB or GLTF file');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Create object URL for the file
      const url = URL.createObjectURL(file);
      const name = file.name.replace(/\.(glb|gltf)$/i, '');
      await viewerRef.current.addFurniture(url, name);

      // Enable edit mode when adding furniture
      if (!editMode) {
        onEditModeChange(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model');
    } finally {
      setIsLoading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [viewerRef, editMode, onEditModeChange]);

  // Handle URL input
  const handleUrlAdd = useCallback(async () => {
    if (!urlInput.trim() || !viewerRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      // Extract name from URL
      const urlParts = urlInput.split('/');
      const fileName = urlParts[urlParts.length - 1] || 'Model';
      const name = fileName.replace(/\.(glb|gltf)$/i, '');

      await viewerRef.current.addFurniture(urlInput, name);
      setUrlInput('');

      // Enable edit mode when adding furniture
      if (!editMode) {
        onEditModeChange(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load model from URL');
    } finally {
      setIsLoading(false);
    }
  }, [urlInput, viewerRef, editMode, onEditModeChange]);

  // Handle furniture selection
  const handleSelect = useCallback((id: string) => {
    if (viewerRef.current) {
      viewerRef.current.selectFurniture(id);
    }
  }, [viewerRef]);

  // Handle furniture removal
  const handleRemove = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewerRef.current) {
      viewerRef.current.removeFurniture(id);
    }
  }, [viewerRef]);

  return (
    <div className={`bg-muted/50 border border-border rounded-xl overflow-hidden ${className}`}>
      {/* Collapsible Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full p-4 flex items-center justify-between hover:bg-accent/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-foreground">Upload Custom Model</h3>
            <p className="text-[11px] text-muted-foreground">Add your own GLB/GLTF files</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Edit mode toggle */}
          {!isCollapsed && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEditModeChange(!editMode);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                editMode
                  ? 'bg-sky-500 text-white'
                  : 'bg-accent text-muted-foreground hover:text-foreground'
              }`}
            >
              {editMode ? 'Editing' : 'Edit'}
            </button>
          )}
          {/* Collapse indicator */}
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Collapsible Content */}
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-3">
        {/* File upload */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".glb,.gltf"
            onChange={handleFileSelect}
            className="hidden"
            id="furniture-file-input"
          />
          <label
            htmlFor="furniture-file-input"
            className={`flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed
                       border-border rounded-lg cursor-pointer transition-colors
                       hover:border-brand/50 hover:bg-accent/50 ${isLoading ? 'opacity-50 cursor-wait' : ''}`}
          >
            {isLoading ? (
              <svg className="w-5 h-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            )}
            <span className="text-sm text-muted-foreground">
              {isLoading ? 'Loading...' : 'Upload GLB file'}
            </span>
          </label>
        </div>

        {/* URL input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleUrlAdd()}
            placeholder="Or paste GLB URL..."
            className="flex-1 px-3 py-2 text-sm bg-muted border border-border rounded-lg
                       text-foreground placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50"
            disabled={isLoading}
          />
          <button
            onClick={handleUrlAdd}
            disabled={!urlInput.trim() || isLoading}
            className="px-3 py-2 bg-brand text-white text-sm font-medium rounded-lg
                       hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Add
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-xs">
            {error}
          </div>
        )}

        {/* Placed furniture list */}
        {furniture.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Placed Objects ({furniture.length})
            </h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {furniture.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleSelect(item.id)}
                  className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                    selectedFurnitureId === item.id
                      ? 'bg-sky-500/20 border border-sky-500/30'
                      : 'bg-accent/50 hover:bg-accent border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-6 h-6 rounded bg-muted flex items-center justify-center flex-shrink-0">
                      <svg className="w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                    </div>
                    <span className="text-sm text-foreground truncate">{item.name}</span>
                  </div>
                  <button
                    onClick={(e) => handleRemove(item.id, e)}
                    className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      )}
    </div>
  );
}
