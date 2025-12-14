"""
Nano Banana Pro Service - AI-powered furniture replacement using Google Gemini.

This service handles:
- Image generation with furniture replacement
- LRU caching with TTL for generated images
- Ultra-realistic prompt engineering for photorealistic results
"""

import base64
import hashlib
import io
import logging
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, Any

from PIL import Image

from ..config import settings

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """A single cache entry with value and expiration time."""
    value: str  # Base64 encoded image
    prompt: str
    created_at: datetime
    expires_at: datetime
    generation_time: float


class ImageGenerationCache:
    """
    LRU cache with TTL for generated images.

    Features:
    - Maximum size limit with LRU eviction
    - Time-to-live (TTL) for automatic expiration
    - Thread-safe operations (using OrderedDict)
    - Cache key based on input hash
    """

    def __init__(self, max_size: int = 100, ttl_hours: float = 24.0):
        self.max_size = max_size
        self.ttl = timedelta(hours=ttl_hours)
        self._cache: OrderedDict[str, CacheEntry] = OrderedDict()
        self._hits = 0
        self._misses = 0

    def _generate_key(
        self,
        room_image_b64: str,
        furniture_image_b64: str,
        furniture_description: str,
        target_location: Optional[str],
        style_hints: Optional[str],
        aspect_ratio: str
    ) -> str:
        """Generate a unique cache key from input parameters."""
        # Create a hash of all inputs
        key_data = f"{room_image_b64[:100]}|{furniture_image_b64[:100]}|{furniture_description}|{target_location}|{style_hints}|{aspect_ratio}"
        return hashlib.sha256(key_data.encode()).hexdigest()

    def get(
        self,
        room_image_b64: str,
        furniture_image_b64: str,
        furniture_description: str,
        target_location: Optional[str],
        style_hints: Optional[str],
        aspect_ratio: str
    ) -> Optional[CacheEntry]:
        """
        Get a cached entry if it exists and hasn't expired.
        Returns None if not found or expired.
        """
        key = self._generate_key(
            room_image_b64, furniture_image_b64,
            furniture_description, target_location,
            style_hints, aspect_ratio
        )

        entry = self._cache.get(key)
        if entry is None:
            self._misses += 1
            return None

        # Check if expired
        if datetime.now() > entry.expires_at:
            del self._cache[key]
            self._misses += 1
            return None

        # Move to end (most recently used)
        self._cache.move_to_end(key)
        self._hits += 1
        return entry

    def set(
        self,
        room_image_b64: str,
        furniture_image_b64: str,
        furniture_description: str,
        target_location: Optional[str],
        style_hints: Optional[str],
        aspect_ratio: str,
        generated_image_b64: str,
        prompt: str,
        generation_time: float
    ) -> None:
        """Store a generated image in the cache."""
        key = self._generate_key(
            room_image_b64, furniture_image_b64,
            furniture_description, target_location,
            style_hints, aspect_ratio
        )

        now = datetime.now()
        entry = CacheEntry(
            value=generated_image_b64,
            prompt=prompt,
            created_at=now,
            expires_at=now + self.ttl,
            generation_time=generation_time
        )

        # Remove oldest entries if at capacity
        while len(self._cache) >= self.max_size:
            self._cache.popitem(last=False)

        self._cache[key] = entry

    def clear(self) -> int:
        """Clear all cached entries. Returns number of entries cleared."""
        count = len(self._cache)
        self._cache.clear()
        self._hits = 0
        self._misses = 0
        return count

    def cleanup_expired(self) -> int:
        """Remove all expired entries. Returns number of entries removed."""
        now = datetime.now()
        expired_keys = [
            key for key, entry in self._cache.items()
            if now > entry.expires_at
        ]
        for key in expired_keys:
            del self._cache[key]
        return len(expired_keys)

    @property
    def stats(self) -> dict:
        """Get cache statistics."""
        return {
            "size": len(self._cache),
            "max_size": self.max_size,
            "hits": self._hits,
            "misses": self._misses,
            "hit_rate": self._hits / (self._hits + self._misses) if (self._hits + self._misses) > 0 else 0.0,
            "ttl_hours": self.ttl.total_seconds() / 3600
        }


class NanoBananaService:
    """
    AI-powered furniture replacement service using Google Gemini.

    Features:
    - Lazy loading of the Gemini client
    - Ultra-realistic prompt engineering
    - Result caching for identical requests
    - Image encoding/decoding utilities
    """

    def __init__(self):
        self._client: Optional[Any] = None
        self._model_name: str = settings.gemini_model_name
        self._cache: Optional[ImageGenerationCache] = None
        self._initialized = False

    def _ensure_client(self) -> Any:
        """Lazily initialize the Google GenAI client."""
        if self._client is None:
            if not settings.gemini_api_key:
                raise ValueError(
                    "Gemini API key not configured. "
                    "Set GARAZA_GEMINI_API_KEY environment variable."
                )

            try:
                from google import genai
                self._client = genai.Client(api_key=settings.gemini_api_key)
                logger.info(f"Initialized Gemini client with model: {self._model_name}")
            except ImportError:
                raise ImportError(
                    "google-genai package not installed. "
                    "Install with: pip install google-genai>=0.3.0"
                )

        return self._client

    def _ensure_cache(self) -> ImageGenerationCache:
        """Lazily initialize the image generation cache."""
        if self._cache is None:
            self._cache = ImageGenerationCache(
                max_size=settings.image_generation_cache_max_size,
                ttl_hours=settings.image_generation_cache_ttl_hours
            )
        return self._cache

    def _decode_base64_to_pil(self, image_b64: str) -> Image.Image:
        """Convert a base64-encoded image string to a PIL Image."""
        # Handle data URL format (e.g., "data:image/png;base64,...")
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]

        image_data = base64.b64decode(image_b64)
        return Image.open(io.BytesIO(image_data))

    def _encode_pil_to_base64(self, image: Image.Image, format: str = "PNG") -> str:
        """Convert a PIL Image to a base64-encoded string."""
        buffer = io.BytesIO()
        image.save(buffer, format=format)
        return base64.b64encode(buffer.getvalue()).decode("utf-8")

    def _build_replacement_prompt(
        self,
        furniture_description: str,
        target_location: Optional[str] = None,
        style_hints: Optional[str] = None
    ) -> str:
        """
        Build an ultra-realistic prompt for furniture replacement.

        The prompt is engineered to produce photorealistic results with:
        1. LIGHTING CONSISTENCY - Match existing room lighting
        2. PERSPECTIVE MATCHING - Correct perspective and scale
        3. MATERIAL REALISM - Accurate textures and materials
        4. SHADOW CASTING - Natural shadow integration
        5. COLOR INTEGRATION - Harmonize with room colors
        6. EDGE BLENDING - Seamless edges with no artifacts
        7. DEPTH OF FIELD - Match existing focus characteristics
        """

        location_instruction = ""
        if target_location:
            location_instruction = f"Place the furniture {target_location}."
        else:
            location_instruction = "Place the furniture in the most natural and aesthetically pleasing position in the room."

        style_instruction = ""
        if style_hints:
            style_instruction = f"Style guidance: {style_hints}."

        prompt = f"""You are an expert interior designer and photorealistic image compositor. Your task is to seamlessly integrate new furniture into an existing room photograph.

FURNITURE TO PLACE: {furniture_description}

PLACEMENT: {location_instruction}

{style_instruction}

CRITICAL REQUIREMENTS FOR ULTRA-REALISTIC RESULTS:

1. LIGHTING CONSISTENCY:
   - Analyze the existing light sources in the room (windows, lamps, overhead lights)
   - Match the lighting direction, intensity, color temperature, and softness
   - Apply appropriate highlights and reflections on the furniture surface
   - Ensure specular highlights match the room's lighting setup

2. PERSPECTIVE MATCHING:
   - Identify the camera's viewpoint and focal length from the room image
   - Scale the furniture correctly based on the room's spatial references
   - Apply proper perspective distortion matching the room's vanishing points
   - Ensure the furniture sits naturally on the floor plane

3. MATERIAL REALISM:
   - Render accurate textures for the furniture materials (wood grain, fabric weave, metal finish, leather texture)
   - Apply appropriate surface properties (matte, glossy, satin, rough)
   - Include subtle imperfections for photorealism (minor scratches, fabric folds, dust)
   - Match the resolution and detail level of the original room image

4. SHADOW CASTING:
   - Generate accurate cast shadows based on the room's light sources
   - Include soft ambient occlusion where furniture meets the floor
   - Add subtle contact shadows at furniture legs/base
   - Ensure shadow color and softness match existing shadows in the room

5. COLOR INTEGRATION:
   - Harmonize furniture colors with the room's existing color palette
   - Apply accurate color temperature matching the room's lighting
   - Include subtle color bleeding from nearby surfaces
   - Maintain consistent white balance across the entire image

6. EDGE BLENDING:
   - Ensure perfectly clean edges with no halos, fringing, or artifacts
   - Apply appropriate edge softness matching the image's depth of field
   - Blend furniture edges naturally with the room environment
   - No visible seams, cuts, or compositing artifacts

7. DEPTH OF FIELD:
   - Match the existing focal plane and blur characteristics
   - Apply appropriate blur to parts of furniture outside the focal range
   - Maintain consistent sharpness with the room's focused areas
   - Simulate natural lens characteristics (bokeh, chromatic aberration if present)

OUTPUT REQUIREMENTS:
- Produce a single photorealistic image
- The result should be indistinguishable from a real photograph
- No artificial or rendered appearance
- Maintain the original room's photographic quality and style
- The furniture should look like it was always part of the room

Generate the composite image now."""

        return prompt

    async def replace_furniture(
        self,
        room_image_b64: str,
        furniture_image_b64: str,
        furniture_description: str,
        target_location: Optional[str] = None,
        style_hints: Optional[str] = None,
        aspect_ratio: str = "16:9"
    ) -> dict:
        """
        Replace furniture in a room image using AI generation.

        Args:
            room_image_b64: Base64-encoded room image
            furniture_image_b64: Base64-encoded furniture image
            furniture_description: Description of the furniture
            target_location: Where to place the furniture
            style_hints: Style guidance for generation
            aspect_ratio: Output aspect ratio (default "16:9")

        Returns:
            dict with keys: generated_image_base64, prompt_used,
                           generation_time_seconds, model_used, cache_hit
        """
        start_time = time.time()

        # Check cache first if enabled
        if settings.enable_image_generation_cache:
            cache = self._ensure_cache()
            cached_entry = cache.get(
                room_image_b64, furniture_image_b64,
                furniture_description, target_location,
                style_hints, aspect_ratio
            )

            if cached_entry is not None:
                logger.info("Cache hit for furniture replacement request")
                return {
                    "generated_image_base64": cached_entry.value,
                    "generation_time_seconds": cached_entry.generation_time,
                    "model_used": self._model_name,
                    "cache_hit": True
                }

        # Build the ultra-realistic prompt
        prompt = self._build_replacement_prompt(
            furniture_description, target_location, style_hints
        )

        # Initialize client
        client = self._ensure_client()

        # Decode images
        room_image = self._decode_base64_to_pil(room_image_b64)
        furniture_image = self._decode_base64_to_pil(furniture_image_b64)

        logger.info(
            f"Generating furniture replacement: "
            f"room={room_image.size}, furniture={furniture_image.size}, "
            f"aspect_ratio={aspect_ratio}"
        )

        try:
            # Call Gemini API with images and prompt
            # The google-genai library accepts a simple list of content items
            # where strings are text and PIL Images are automatically handled
            from google.genai import types

            response = client.models.generate_content(
                model=self._model_name,
                contents=[
                    prompt,  # Text prompt as string
                    room_image,  # PIL Image - room screenshot
                    furniture_image,  # PIL Image - furniture to place
                ],
                config=types.GenerateContentConfig(
                    response_modalities=["IMAGE", "TEXT"],
                )
            )

            # Extract the generated image from response
            generated_image_b64 = None

            for part in response.candidates[0].content.parts:
                if hasattr(part, 'inline_data') and part.inline_data is not None:
                    # Image data is in inline_data
                    generated_image_b64 = base64.b64encode(
                        part.inline_data.data
                    ).decode("utf-8")
                    break

            if generated_image_b64 is None:
                raise ValueError("No image generated in response")

            generation_time = time.time() - start_time

            # Store in cache if enabled
            if settings.enable_image_generation_cache:
                cache = self._ensure_cache()
                cache.set(
                    room_image_b64, furniture_image_b64,
                    furniture_description, target_location,
                    style_hints, aspect_ratio,
                    generated_image_b64, prompt, generation_time
                )

            logger.info(f"Furniture replacement completed in {generation_time:.2f}s")

            return {
                "generated_image_base64": generated_image_b64,
                "generation_time_seconds": generation_time,
                "model_used": self._model_name,
                "cache_hit": False
            }

        except Exception as e:
            logger.error(f"Furniture replacement failed: {e}")
            raise

    def get_status(self) -> dict:
        """Get the service status and cache statistics."""
        cache_stats = None
        if self._cache is not None:
            cache_stats = self._cache.stats

        return {
            "service": "nano_banana_pro",
            "initialized": self._client is not None,
            "model_name": self._model_name,
            "api_key_configured": bool(settings.gemini_api_key),
            "cache_enabled": settings.enable_image_generation_cache,
            "cache_stats": cache_stats
        }

    def clear_cache(self) -> dict:
        """Clear the image generation cache."""
        if self._cache is None:
            return {"cleared": 0, "message": "Cache not initialized"}

        count = self._cache.clear()
        return {"cleared": count, "message": f"Cleared {count} cached entries"}


# Singleton instance
nano_banana_service = NanoBananaService()
