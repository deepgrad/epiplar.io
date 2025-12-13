from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .config import settings
from .api.routes import router as api_router
from .api.websocket import router as ws_router

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Create temp directory
    settings.temp_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Temp directory created: {settings.temp_dir}")

    # Optionally preload model here
    # from .services.depth_service import depth_service
    # await depth_service.initialize()

    yield

    # Shutdown: Cleanup
    logger.info("Shutting down...")

app = FastAPI(
    title="Garaza Depth Estimation API",
    description="Depth Anything V3 powered depth estimation for video",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(api_router, prefix="/api")
app.include_router(ws_router)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
