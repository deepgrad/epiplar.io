"""
Image Generation Routes - Nano Banana Pro furniture replacement API.

Provides endpoints for:
- AI-powered furniture replacement in room images
- Image proxy for CORS bypass
- Service status and cache management
"""

import base64
import logging
import time
from typing import Optional

import aiohttp
from fastapi import APIRouter, HTTPException, status

from ..models.schemas import (
    FurnitureReplacementRequest,
    FurnitureReplacementResponse,
    ImageProxyRequest,
    ImageProxyResponse,
)
from ..services.nano_banana_service import nano_banana_service
from ..config import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/image", tags=["Image Generation"])


@router.post(
    "/replace-furniture",
    response_model=FurnitureReplacementResponse,
    summary="Replace furniture in a room image",
    description=(
        "Uses AI (Google Gemini) to seamlessly replace or add furniture "
        "to a room photograph with ultra-realistic results."
    ),
)
async def replace_furniture(request: FurnitureReplacementRequest) -> FurnitureReplacementResponse:
    """
    Replace furniture in a room image using AI generation.

    This endpoint accepts a room image, a furniture image, and descriptive
    parameters to generate a photorealistic composite where the furniture
    is seamlessly integrated into the room.

    The AI uses ultra-realistic prompt engineering to ensure:
    - Lighting consistency with the room
    - Correct perspective and scale
    - Natural shadow casting
    - Material realism
    - Seamless edge blending
    """
    try:
        # Validate that API key is configured
        if not settings.gemini_api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=(
                    "Gemini API key not configured. "
                    "Set GARAZA_GEMINI_API_KEY environment variable."
                )
            )

        # Validate input images are not empty
        if not request.room_image_base64:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="room_image_base64 cannot be empty"
            )

        if not request.furniture_image_base64:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="furniture_image_base64 cannot be empty"
            )

        if not request.furniture_description:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="furniture_description cannot be empty"
            )

        # Call the service
        result = await nano_banana_service.replace_furniture(
            room_image_b64=request.room_image_base64,
            furniture_image_b64=request.furniture_image_base64,
            furniture_description=request.furniture_description,
            target_location=request.target_location,
            style_hints=request.style_hints,
            aspect_ratio=request.aspect_ratio or "16:9"
        )

        return FurnitureReplacementResponse(
            generated_image_base64=result["generated_image_base64"],
            generation_time_seconds=result["generation_time_seconds"],
            model_used=result["model_used"],
            cache_hit=result["cache_hit"]
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.error(f"Validation error in furniture replacement: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Furniture replacement failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Furniture replacement failed: {str(e)}"
        )


@router.post(
    "/proxy",
    response_model=ImageProxyResponse,
    summary="Proxy external image URL",
    description=(
        "Fetches an image from an external URL and returns it as base64. "
        "Useful for bypassing CORS restrictions when loading images from "
        "external sources."
    ),
)
async def proxy_image(request: ImageProxyRequest) -> ImageProxyResponse:
    """
    Fetch an external image and return it as base64.

    This endpoint acts as a CORS bypass proxy, allowing the frontend
    to load images from external URLs that might block cross-origin requests.
    """
    try:
        # Validate URL
        if not request.url:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="URL cannot be empty"
            )

        # Basic URL validation
        if not request.url.startswith(("http://", "https://")):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="URL must start with http:// or https://"
            )

        logger.info(f"Proxying image from: {request.url}")

        async with aiohttp.ClientSession() as session:
            async with session.get(
                request.url,
                timeout=aiohttp.ClientTimeout(total=30),
                headers={
                    "User-Agent": "Mozilla/5.0 (compatible; Epipar.io/1.0)"
                }
            ) as response:
                if response.status != 200:
                    raise HTTPException(
                        status_code=status.HTTP_502_BAD_GATEWAY,
                        detail=f"Failed to fetch image: HTTP {response.status}"
                    )

                # Check content type
                content_type = response.headers.get("Content-Type", "")
                if not content_type.startswith("image/"):
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"URL does not point to an image: {content_type}"
                    )

                # Read and encode image data
                image_data = await response.read()
                image_base64 = base64.b64encode(image_data).decode("utf-8")

                # Add data URL prefix based on content type
                mime_type = content_type.split(";")[0].strip()
                full_base64 = f"data:{mime_type};base64,{image_base64}"

                return ImageProxyResponse(image_base64=full_base64)

    except HTTPException:
        raise
    except aiohttp.ClientError as e:
        logger.error(f"HTTP client error proxying image: {e}")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to fetch image: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Image proxy failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Image proxy failed: {str(e)}"
        )


@router.get(
    "/status",
    summary="Get image generation service status",
    description="Returns the current status of the Nano Banana Pro service including cache statistics.",
)
async def get_status() -> dict:
    """
    Get the status of the image generation service.

    Returns information about:
    - Whether the service is initialized
    - The configured model name
    - Whether the API key is configured
    - Cache statistics (if enabled)
    """
    try:
        status_info = nano_banana_service.get_status()
        return {
            "status": "operational" if status_info["api_key_configured"] else "unconfigured",
            **status_info
        }
    except Exception as e:
        logger.error(f"Failed to get service status: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@router.post(
    "/clear-cache",
    summary="Clear image generation cache",
    description="Clears all cached generated images. Useful for freeing memory or forcing regeneration.",
)
async def clear_cache() -> dict:
    """
    Clear the image generation cache.

    Returns the number of entries that were cleared.
    """
    try:
        result = nano_banana_service.clear_cache()
        logger.info(f"Cache cleared: {result}")
        return {
            "success": True,
            **result
        }
    except Exception as e:
        logger.error(f"Failed to clear cache: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear cache: {str(e)}"
        )


@router.get(
    "/health",
    summary="Health check for image generation service",
    description="Simple health check endpoint for the image generation service.",
)
async def health_check() -> dict:
    """
    Simple health check for the image generation service.

    Returns basic status information for monitoring.
    """
    return {
        "service": "nano_banana_pro",
        "status": "healthy",
        "api_key_configured": bool(settings.gemini_api_key),
        "cache_enabled": settings.enable_image_generation_cache,
        "model": settings.gemini_model_name
    }
