from contextlib import asynccontextmanager
import time
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import logging

from .config import settings
from .api.routes import router as api_router
from .api.websocket import router as ws_router
from .api.auth_routes import router as auth_router
from .api.furniture_routes import router as furniture_router
from .api.profile_routes import router as profile_router
from .api.room_routes import router as room_router
from .api.yolo_routes import router as yolo_router
from .api.image_generation_routes import router as image_generation_router
from .db.database import init_db

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Threshold for slow request warnings (in seconds)
SLOW_REQUEST_THRESHOLD = 1.0


class TimingMiddleware(BaseHTTPMiddleware):
    """Middleware to track request processing time and log slow requests."""

    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.perf_counter()

        response = await call_next(request)

        process_time = time.perf_counter() - start_time

        # Add X-Process-Time header to response
        response.headers["X-Process-Time"] = f"{process_time:.4f}"

        # Log warning for slow requests
        if process_time > SLOW_REQUEST_THRESHOLD:
            logger.warning(
                f"Slow request: {request.method} {request.url.path} "
                f"took {process_time:.4f}s (threshold: {SLOW_REQUEST_THRESHOLD}s)"
            )

        return response


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

# Middleware order (LIFO - last added runs first):
# 1. CORS (innermost) - closest to app, ensures CORS headers on all responses
# 2. GZip (middle) - compresses response bodies > 1KB
# 3. Timing (outermost) - measures total request time including middleware

# CORS middleware - added first (innermost layer)
# Handles preflight OPTIONS and ensures CORS headers on all responses
# Using allow_origin_regex to match localhost on any port for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# GZip compression middleware - compresses responses larger than 1KB
# Beneficial for JSON responses; already-compressed GLB files won't compress further
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Timing middleware - added last so it runs first (outermost)
# Tracks total request time and logs slow requests (> 1.0s)
app.add_middleware(TimingMiddleware)

# Include routers
app.include_router(auth_router, prefix="/api")
app.include_router(api_router, prefix="/api")
app.include_router(furniture_router, prefix="/api")
app.include_router(profile_router, prefix="/api")
app.include_router(room_router, prefix="/api")
app.include_router(yolo_router, prefix="/api")
app.include_router(image_generation_router, prefix="/api")
app.include_router(ws_router)

@app.get("/health")
async def health_check():
    return {"status": "healthy"}
