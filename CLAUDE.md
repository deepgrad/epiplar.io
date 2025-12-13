# CLAUDE.md - Epipar.io Project Guide

## Project Overview

**Epipar.io** is an AI-powered web application for 3D room reconstruction from video. Users upload a video of their room, and the application converts it into an interactive 3D point cloud visualization using the Depth Anything V2 model.

### Core Features

- Video upload with drag-and-drop support
- Real-time AI-powered depth estimation from video frames
- Interactive 3D point cloud visualization
- Depth map visualization with frame playback
- Combined multi-frame point cloud generation
- Point cloud data export to JSON format
- WebGPU acceleration with WASM fallback

---

## Tech Stack

| Category        | Technology                                        |
| --------------- | ------------------------------------------------- |
| Framework       | React 18.3 + TypeScript 5.6                       |
| Build Tool      | Vite 6.0                                          |
| 3D Graphics     | Three.js 0.182                                    |
| AI/ML           | @huggingface/transformers 3.8 (Depth Anything V2) |
| Styling         | Tailwind CSS 3.4                                  |
| Package Manager | Bun                                               |

---

## Project Structure

```
garaza/
├── src/
│   ├── App.tsx                    # Main app component, state machine
│   ├── main.tsx                   # React entry point
│   ├── index.css                  # Global styles + Tailwind imports
│   ├── components/
│   │   ├── VideoUpload.tsx        # Drag-and-drop video upload
│   │   ├── ProcessingStatus.tsx   # Progress tracker with stages
│   │   ├── ResultsPreview.tsx     # Results view, visualization modes
│   │   ├── PointCloudViewer.tsx   # Three.js 3D point cloud renderer
│   │   └── DepthMapViewer.tsx     # Depth map visualization
│   └── services/
│       └── depthEstimation.ts     # AI depth estimation service
├── public/                        # Static assets
├── index.html                     # HTML entry point
├── tailwind.config.js             # Tailwind configuration
├── vite.config.ts                 # Vite configuration
├── tsconfig.json                  # TypeScript configuration
└── package.json                   # Dependencies and scripts
```

---

## Commands

```bash
# Install dependencies
bun install

# Start development server
bun run dev

# Build for production (runs tsc + vite build)
bun run build

# Preview production build
bun run preview

# Lint code
bun run lint
```

---

## Architecture

### Application State Flow

```
upload → processing → results
           ↓
         error (recoverable)
```

The app uses a simple state machine in `App.tsx`:

- **upload**: Initial state, shows VideoUpload component
- **processing**: Shows ProcessingStatus while AI processes video
- **results**: Shows ResultsPreview with 3D visualization
- **error**: Shows error message with recovery options

### Component Responsibilities

| Component              | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `App.tsx`              | State management, layout, orchestration     |
| `VideoUpload.tsx`      | File input, drag-and-drop, validation       |
| `ProcessingStatus.tsx` | Progress UI, stage display, cancel button   |
| `ResultsPreview.tsx`   | Tab navigation, export, mode switching      |
| `PointCloudViewer.tsx` | Three.js scene, OrbitControls, 3D rendering |
| `DepthMapViewer.tsx`   | Canvas-based depth map display              |

### Service Layer

**depthEstimation.ts** handles:

- Lazy AI model initialization
- WebGPU → WASM fallback logic
- Video frame extraction
- Depth estimation per frame
- Progress callback reporting

---

## Key Patterns

### React Patterns

- Functional components with hooks only
- `useCallback` for event handlers (prevents re-renders)
- `useRef` for DOM references and animation frames
- `useMemo` for expensive computations (point cloud generation)
- `AbortController` for cancellable async operations

### AI/ML Patterns

- Lazy model loading (loaded on first use)
- Progress callbacks for long-running operations
- Automatic backend fallback (WebGPU → WASM)

### 3D Visualization Patterns

- Three.js scene setup in `useEffect` with cleanup
- OrbitControls for interactive camera
- Point downsampling for performance (max 50,000 points)
- Depth-to-3D projection with camera intrinsics

### Styling Patterns

- Tailwind utility classes
- Responsive breakpoints: `sm:`, `md:`, `lg:`
- Gradient backgrounds
- Consistent spacing scale

---

## Configuration Details

### Vite Configuration (vite.config.ts)

Special CORS headers required for ONNX runtime:

```typescript
headers: {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}
```

These enable `SharedArrayBuffer` for multi-threaded AI inference.

### TypeScript Configuration

- Target: ES2020
- Strict mode enabled
- JSX: react-jsx
- Module resolution: bundler

### Tailwind Configuration

Custom primary color palette (sky blue) and Inter font family.

---

## Video Processing Parameters

| Parameter       | Default | Description                                         |
| --------------- | ------- | --------------------------------------------------- |
| `maxFrames`     | 8       | Number of frames to extract                         |
| `frameInterval` | 30      | Frames between extractions (~1 per second at 30fps) |
| `maxPoints`     | 50,000  | Point cloud downsampling limit                      |

### Supported Formats

- MP4, MOV, WebM
- Max file size: 500MB

---

## Browser Requirements

- **Required**: SharedArrayBuffer support, WebGL
- **Optional**: WebGPU (better performance, falls back to WASM)
- **Target**: Modern browsers with ES2020+ support

---

## Development Guidelines

### Adding New Components

1. Create component in `src/components/`
2. Define Props interface above the component
3. Use functional component with hooks
4. Export as default

### Modifying AI Processing

1. Edit `src/services/depthEstimation.ts`
2. Adjust `maxFrames` or `frameInterval` for different sampling
3. Progress callback receives: `{ stage, progress, message }`

### Modifying 3D Visualization

1. Edit `src/components/PointCloudViewer.tsx`
2. Three.js scene is initialized in `useEffect`
3. Cleanup function disposes resources properly
4. Point colors come from video frame RGB

### State Management

App-level state lives in `App.tsx`. For complex additions, consider:

- Extracting to custom hooks
- Using React Context for deeply nested state

---

## Error Handling

### Common Errors

| Error                       | Cause                | Solution                     |
| --------------------------- | -------------------- | ---------------------------- |
| SharedArrayBuffer undefined | Missing CORS headers | Check vite.config.ts headers |
| WebGL context lost          | GPU overload         | Reduce maxPoints, refresh    |
| Model load failure          | Network/memory issue | Check console, retry         |

### Error Recovery

The app shows error state with:

- User-friendly message
- "Try Again" button (returns to upload)
- Console logging for debugging

---

## Performance Considerations

### Optimizations in Place

- Lazy AI model loading
- Configurable frame extraction
- Point cloud downsampling
- Memoized calculations
- WebGPU when available

### If Performance Issues Occur

1. Reduce `maxFrames` in depthEstimation.ts
2. Reduce `maxPoints` in PointCloudViewer.tsx
3. Check WebGPU availability in browser console
4. Use shorter/lower-resolution videos

---

## Dependencies Reference

### Core

- `react`, `react-dom`: UI framework
- `three`: 3D visualization
- `@huggingface/transformers`: AI inference

### Build/Dev

- `vite`: Build tool
- `typescript`: Type checking
- `tailwindcss`: Styling
- `eslint`: Linting

### Types

- `@types/react`, `@types/react-dom`
- `@types/three`

---

## Common Tasks

### Change number of processed frames

Edit `src/services/depthEstimation.ts`:

```typescript
const maxFrames = 8; // Change this value
```

### Change point cloud density

Edit `src/components/PointCloudViewer.tsx`:

```typescript
const maxPoints = 50000; // Change this value
```

### Add new visualization mode

1. Add tab in `ResultsPreview.tsx`
2. Create new viewer component
3. Pass appropriate data from results

### Modify color scheme

Edit `tailwind.config.js` primary color palette.

---

## Notes

- No testing framework currently configured
- SharedArrayBuffer requires specific server headers
- WebGPU provides ~2-3x faster inference than WASM
- Point cloud export is JSON format (can be large files)
- The app name "Epipar.io" relates to room/furniture redesign concept
