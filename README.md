# Interia - AI-Powered Room Redesign

<p align="center">
  <img src="public/logo-purple.svg" alt="Interia Logo" width="120">
</p>

<p align="center">
  <strong>Transform any room with AI-powered 3D reconstruction and intelligent furniture replacement</strong>
</p>

---

<p align="center">
  <a href="https://www.youtube.com/watch?v=hBA3fvoU_DI" align="center">
  <img height="285" alt="image" src="https://github.com/user-attachments/assets/098747f0-ddef-4616-bbfe-33d1a10299f0" />
  <p align="center">Click on the image above for preview (YT link)</p>
  </a>
</p>


## Overview

**Interia** is a full-stack AI application that transforms video recordings of rooms into interactive 3D point cloud visualizations. Upload a video of your room, and our AI pipeline powered by **Depth Anything V3** and enhnaced with diffusion, reconstructs it in 3D, detects furniture using **YOLOv8**, and enables intelligent furniture replacement with **Google Gemini** image generation.

## Features

### 🎥 Video-to-3D Reconstruction
- Upload room videos with drag-and-drop support
- Real-time depth estimation using Depth Anything V3
- Multi-view depth with spatial consistency
- Interactive 3D point cloud visualization with Three.js
- Camera pose estimation (intrinsics & extrinsics)

### 🛋️ AI Furniture Detection & Search
- YOLOv8-powered furniture detection from room screenshots
- Semantic product search with sentence transformers
- Sponsored brand boosting system
- Product catalog with 45,000+ items

### 🎨 Smart Furniture Replacement
- AI-powered furniture replacement with Google Gemini
- Ultra-realistic photorealistic rendering
- LRU caching with TTL for generated images
- Preview replacements before committing

## Tech Stack

### Frontend
| Technology | Purpose |
|------------|---------|
| React 18 + TypeScript | UI Framework |
| Vite 7 | Build Tool |
| Three.js | 3D Visualization |
| Tailwind CSS | Styling |
| React Router | Navigation |

### Backend
| Technology | Purpose |
|------------|---------|
| FastAPI + Uvicorn | API Server |
| Depth Anything V3 | Depth Estimation |
| YOLOv8 | Object Detection |
| Google Gemini | AI Image Generation |
| Sentence Transformers | Semantic Search |
| SQLAlchemy + SQLite | Database |
| Docker + NVIDIA CUDA | GPU Acceleration |

## Quick Start

### Prerequisites

- **Node.js 18+** / **Bun** (Frontend)
- **Python 3.11+** (Backend)
- **NVIDIA GPU with CUDA 12.1+** (Required for AI processing)
- **Docker** with nvidia-container-toolkit (Recommended)

### Frontend Setup

```bash
# Install dependencies
bun install

# Start development server
bun run dev
```

The frontend runs at `http://localhost:5173`

### Backend Setup

#### Option 1: Docker (Recommended)

```bash
cd backend

# Production
docker-compose up --build

# Development (with hot reload)
docker-compose -f docker-compose.dev.yml up --build
```

#### Option 2: Local Python

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/macOS
# or: .\venv\Scripts\activate  # Windows

# Install dependencies
pip install -r requirements.txt
pip install git+https://github.com/ByteDance-Seed/Depth-Anything-3.git

# Start server
uvicorn app.main:app --reload --port 8000
```

The backend runs at `http://localhost:8000`

## Project Structure

```
interia/
├── src/                          # Frontend (React)
│   ├── components/               # React components
│   │   ├── VideoUpload.tsx       # Video upload with drag-drop
│   │   ├── ProcessingStatus.tsx  # Progress tracking
│   │   ├── PointCloudViewer.tsx  # Three.js 3D viewer
│   │   ├── FurnitureSearch.tsx   # Product search UI
│   │   └── ...
│   ├── pages/                    # Route pages
│   │   ├── Home.tsx              # Main app page
│   │   ├── MyRooms.tsx           # Saved rooms gallery
│   │   ├── RoomViewer.tsx        # Individual room view
│   │   └── ...
│   ├── contexts/                 # React contexts
│   └── services/                 # API clients
├── backend/                      # Backend (FastAPI)
│   ├── app/
│   │   ├── api/                  # API routes
│   │   ├── services/             # Business logic
│   │   ├── db/                   # Database models
│   │   └── models/               # Pydantic schemas
│   ├── Dockerfile                # GPU-enabled container
│   └── docker-compose.yml        # Production config
├── data/                         # Product catalog CSV
└── public/                       # Static assets
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GARAZA_MAX_FRAMES` | 16 | Frames to extract from video |
| `GARAZA_MODEL_NAME` | da3-base | DA3 model variant |
| `SECRET_KEY` | - | JWT signing key |
| `GOOGLE_API_KEY` | - | Google Gemini API key |

### DA3 Model Variants

| Model | VRAM | Speed | Quality |
|-------|------|-------|---------|
| `da3-small` | 2GB | Fastest | Good |
| `da3-base` | 4GB | Balanced | Better |
| `da3-large` | 8GB+ | Slower | Best |

## Acknowledgments

- [Depth Anything V3](https://github.com/ByteDance-Seed/Depth-Anything-3) by ByteDance
- [YOLOv8](https://github.com/ultralytics/ultralytics) by Ultralytics
- [Three.js](https://threejs.org/) for 3D visualization
- [Google Gemini](https://ai.google.dev/) for AI image generation

---

<p align="center">
  Built with ❤️ for the future of interior design
</p>
