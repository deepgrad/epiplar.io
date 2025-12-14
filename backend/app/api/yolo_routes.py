"""
API routes for YOLO-based furniture detection.
"""
import base64
import io
import logging
from PIL import Image
from fastapi import APIRouter, HTTPException

from ..models.schemas import (
    DetectFurnitureRequest,
    DetectFurnitureResponse,
    FurnitureDetection,
    BoundingBox,
    PixelBoundingBox,
    Point2D,
)
from ..services.yolo_service import yolo_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/yolo", tags=["yolo"])


@router.post("/detect", response_model=DetectFurnitureResponse)
async def detect_furniture(request: DetectFurnitureRequest):
    """
    Detect furniture items in an image.

    Accepts a base64-encoded image (typically a screenshot from the 3D viewer)
    and returns bounding boxes and center points for detected furniture.

    The coordinates are normalized (0-1) relative to image dimensions,
    making it easy to overlay markers on the original canvas.
    """
    try:
        # Decode base64 image to get dimensions
        image_data = request.image_base64
        if "," in image_data:
            image_data = image_data.split(",", 1)[1]

        image_bytes = base64.b64decode(image_data)
        image = Image.open(io.BytesIO(image_bytes))
        image_width, image_height = image.size

        # Run detection
        raw_detections = yolo_service.detect_from_base64(
            request.image_base64,
            confidence_threshold=request.confidence_threshold,
            iou_threshold=request.iou_threshold,
        )

        # Convert to response schema
        detections = []
        for det in raw_detections:
            detections.append(FurnitureDetection(
                class_name=det["class_name"],
                confidence=det["confidence"],
                bbox=BoundingBox(**det["bbox"]),
                center=Point2D(**det["center"]),
                pixel_bbox=PixelBoundingBox(**det["pixel_bbox"]),
            ))

        logger.info(f"Detected {len(detections)} furniture items in {image_width}x{image_height} image")

        return DetectFurnitureResponse(
            detections=detections,
            image_width=image_width,
            image_height=image_height,
        )

    except Exception as e:
        logger.error(f"Furniture detection failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
async def yolo_status():
    """Check if YOLO model is loaded and ready."""
    return {
        "model_loaded": yolo_service._model is not None,
        "device": yolo_service._device,
    }


@router.post("/unload")
async def unload_yolo_model():
    """Unload YOLO model to free memory."""
    yolo_service.unload_model()
    return {"status": "unloaded"}
