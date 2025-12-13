from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from .config import settings
from .api.routes import router as api_router
from .api.websocket import router as ws_router
from .api.auth_routes import router as auth_router
from .api.furniture_routes import router as furniture_router
from .api.profile_routes import router as profile_router
from .db.database import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize database
    await init_db()
    logger.info("Database initialized")

    # Create temp directory
    settings.temp_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"Temp directory created: {settings.temp_dir}")

    yield

    # Shutdown: Cleanup
    logger.info("Shutting down...")

app = FastAPI(
    title="Epipar.io API",
    description="AI-powered 3D room reconstruction API",
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
app.include_router(auth_router, prefix="/api")
app.include_router(api_router, prefix="/api")
app.include_router(furniture_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(ws_router)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
