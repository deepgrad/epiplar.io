# CLAUDE.md - Epipar.io Project Guide

## Project Overview

**Epipar.io** is an AI-powered web application for 3D room reconstruction from video. Users upload a video of their room, and the application converts it into an interactive 3D point cloud visualization using **Depth Anything V3** with a FastAPI backend.

### Core Features

- Video upload with drag-and-drop support
- Real-time AI-powered depth estimation from video frames
- **Multi-view depth estimation** with spatially consistent results
- **Camera pose estimation** (intrinsics & extrinsics)
- Interactive 3D point cloud visualization
- Depth map visualization with frame playback
- Combined multi-frame point cloud generation
- Point cloud data export to JSON format
- **GPU-accelerated backend** via Docker with NVIDIA CUDA

---

## Tech Stack

### Frontend
| Category        | Technology                  |
| --------------- | --------------------------- |
| Framework       | React 18.3 + TypeScript 5.6 |
| Build Tool      | Vite 6.0                    |
| 3D Graphics     | Three.js 0.182              |
| Styling         | Tailwind CSS 3.4            |
| Package Manager | Bun                         |

### Backend
| Category        | Technology                            |
| --------------- | ------------------------------------- |
| Framework       | FastAPI + Uvicorn                     |
| AI/ML           | Depth Anything V3 (PyTorch)           |
| Video Processing| OpenCV                                |
| Deployment      | Docker with NVIDIA CUDA               |
| Real-time       | WebSocket for progress updates        |

---

## Project Structure

```
garaza/
├── src/                           # Frontend (React)
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
│       ├── api.ts                 # Backend API client
│       └── depthEstimation.ts     # Depth utilities & result conversion
├── backend/                       # Backend (FastAPI + DA3)
│   ├── app/
│   │   ├── main.py                # FastAPI application entry
│   │   ├── config.py              # Settings (env-based)
│   │   ├── models/
│   │   │   └── schemas.py         # Pydantic models
│   │   ├── api/
│   │   │   ├── routes.py          # REST endpoints
│   │   │   └── websocket.py       # WebSocket progress handler
│   │   ├── services/
│   │   │   ├── depth_service.py   # DA3 inference service
│   │   │   └── video_service.py   # OpenCV frame extraction
│   │   └── utils/
│   │       └── file_utils.py      # File handling utilities
│   ├── requirements.txt           # Python dependencies
│   ├── Dockerfile                 # GPU-enabled container
│   ├── docker-compose.yml         # Production config
│   └── docker-compose.dev.yml     # Development config
├── public/                        # Static assets
├── index.html                     # HTML entry point
├── vite.config.ts                 # Vite configuration (with proxy)
└── package.json                   # Frontend dependencies
```

---

## Commands

### Frontend

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

### Backend

```bash
# Start with Docker (production)
cd backend
docker-compose up --build

# Start with Docker (development, with hot reload)
cd backend
docker-compose -f docker-compose.dev.yml up --build

# Local development (requires Python 3.11+, CUDA)
cd backend
pip install -r requirements.txt
pip install git+https://github.com/ByteDance-Seed/Depth-Anything-3.git
uvicorn app.main:app --reload --port 8000
```

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                      │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ VideoUpload │───▶│ api.ts      │───▶│ ProcessingStatus│  │
│  │             │    │ (WebSocket) │    │                 │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
│                            │                    │            │
│                            ▼                    ▼            │
│                     ┌─────────────────────────────────┐     │
│                     │ ResultsPreview + 3D Viewers     │     │
│                     └─────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
                             │
                             ▼ HTTP/WebSocket
┌─────────────────────────────────────────────────────────────┐
│                   Backend (FastAPI + Docker)                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────┐  │
│  │ routes.py   │───▶│ video_svc   │───▶│ depth_service   │  │
│  │ (REST API)  │    │ (OpenCV)    │    │ (DA3 + GPU)     │  │
│  └─────────────┘    └─────────────┘    └─────────────────┘  │
│         │                                       │            │
│         ▼                                       ▼            │
│  ┌─────────────┐                     ┌─────────────────┐    │
│  │ websocket.py│◀────────────────────│ Progress Updates│    │
│  └─────────────┘                     └─────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### Application State Flow

```
upload → processing → results
           ↓
         error (recoverable)
```

The app uses a simple state machine in `App.tsx`:

- **upload**: Initial state, shows VideoUpload component
- **processing**: Shows ProcessingStatus while backend processes video
- **results**: Shows ResultsPreview with 3D visualization
- **error**: Shows error message with recovery options

### Frontend Components

| Component              | Purpose                                     |
| ---------------------- | ------------------------------------------- |
| `App.tsx`              | State management, layout, orchestration     |
| `VideoUpload.tsx`      | File input, drag-and-drop, validation       |
| `ProcessingStatus.tsx` | Progress UI, stage display, cancel button   |
| `ResultsPreview.tsx`   | Tab navigation, export, mode switching      |
| `PointCloudViewer.tsx` | Three.js scene, OrbitControls, 3D rendering |
| `DepthMapViewer.tsx`   | Canvas-based depth map display              |

### Frontend Services

| Service               | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `api.ts`              | Backend API client, WebSocket connection    |
| `depthEstimation.ts`  | Result conversion, frame extraction utils   |

### Backend Services

| Service               | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `depth_service.py`    | DA3 model loading and inference             |
| `video_service.py`    | OpenCV-based video frame extraction         |
| `routes.py`           | REST API endpoints                          |
| `websocket.py`        | Real-time progress updates                  |

### API Endpoints

| Endpoint              | Method | Purpose                              |
| --------------------- | ------ | ------------------------------------ |
| `/api/upload`         | POST   | Upload video file                    |
| `/api/process/{id}`   | POST   | Start processing job                 |
| `/api/status/{id}`    | GET    | Get job progress                     |
| `/api/result/{id}`    | GET    | Retrieve depth results               |
| `/api/job/{id}`       | DELETE | Cancel and cleanup job               |
| `/ws/{id}`            | WS     | Real-time progress stream            |
| `/health`             | GET    | Health check                         |

---

## Key Patterns

### React Patterns

- Functional components with hooks only
- `useCallback` for event handlers (prevents re-renders)
- `useRef` for DOM references and animation frames
- `useMemo` for expensive computations (point cloud generation)
- `AbortController` for cancellable async operations

### AI/ML Patterns (Backend)

- Lazy model loading (DA3 loaded on first request)
- GPU-accelerated inference via PyTorch CUDA
- Multi-view depth estimation for spatial consistency
- Camera intrinsics/extrinsics extraction
- Progress callbacks via WebSocket
- CUDA memory cleanup after inference

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

Includes proxy configuration for backend API:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true,
  },
  '/ws': {
    target: 'ws://localhost:8000',
    ws: true,
  },
}
```

Also includes CORS headers for SharedArrayBuffer (kept for compatibility).

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

## Requirements

### Browser (Frontend)

- **Required**: WebGL for 3D visualization
- **Target**: Modern browsers with ES2020+ support

### Server (Backend)

- **Required**: NVIDIA GPU with CUDA 12.1+
- **Docker**: nvidia-container-toolkit for GPU access
- **Memory**: 8GB+ GPU VRAM recommended (4GB minimum with da3-small)
- **Storage**: ~5GB for Docker image and model cache

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

### Frontend

- `react`, `react-dom`: UI framework
- `three`: 3D visualization
- `vite`: Build tool
- `typescript`: Type checking
- `tailwindcss`: Styling
- `@types/react`, `@types/react-dom`, `@types/three`: Type definitions

### Backend (Python)

- `fastapi`, `uvicorn`: Web framework
- `depth-anything-3`: DA3 model (from GitHub)
- `torch`, `torchvision`: PyTorch runtime
- `opencv-python`: Video processing
- `pydantic`, `pydantic-settings`: Data validation
- `aiofiles`: Async file handling
- `websockets`: Real-time updates

---

## Common Tasks

### Change number of processed frames

Edit `backend/app/config.py`:

```python
max_frames: int = 16  # Change this value
```

Or set environment variable: `GARAZA_MAX_FRAMES=16`

### Change point cloud density

Edit `src/components/PointCloudViewer.tsx`:

```typescript
const maxPoints = 50000; // Change this value
```

### Change DA3 model variant

Edit `backend/app/config.py` or set `GARAZA_MODEL_NAME`:
- `da3-small`: Fastest, 2GB VRAM
- `da3-base`: Balanced (default)
- `da3-large`: Best quality, 8GB+ VRAM

### Add new visualization mode

1. Add tab in `ResultsPreview.tsx`
2. Create new viewer component
3. Pass appropriate data from results

### Modify color scheme

Edit `tailwind.config.js` primary color palette.

---

## Notes

- No testing framework currently configured
- Point cloud export is JSON format (can be large files)
- The app name "Epipar.io" relates to room/furniture redesign concept
- DA3 requires GPU for reasonable performance
- Backend uses in-memory job storage (use Redis for production)
- Multi-view DA3 provides spatially consistent depth across frames
- Camera parameters are extracted but not yet used in visualization
