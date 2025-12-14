"""
YOLO v8 service for furniture detection in images.
Designed to be lightweight and detect furniture items from 2D screenshots of 3D scenes.
"""
import logging
from typing import Optional
import base64
import io
import numpy as np
from PIL import Image

logger = logging.getLogger(__name__)

# COCO class indices for furniture items
# Reference: https://docs.ultralytics.com/datasets/detect/coco/
FURNITURE_CLASSES = {
    56: "chair",
    57: "couch",
    59: "bed",
    60: "dining table",
    62: "tv",
    58: "potted plant",  # Often in room scenes
    73: "book",  # Bookshelf items
    74: "clock",
    75: "vase",
    84: "book",  # Duplicate check
}

# Class names we want to detect (for filtering)
FURNITURE_CLASS_NAMES = {
    "chair", "couch", "sofa", "bed", "dining table", "table",
    "tv", "potted plant", "vase", "clock", "bench", "desk"
}


class YOLOService:
    """Service for YOLO-based furniture detection."""

    def __init__(self):
        self._model = None
        self._device = None

    def _load_model(self):
        """Lazy-load the YOLO model on first use."""
        if self._model is not None:
            return

        logger.info("Loading YOLOv8 model...")
        try:
            from ultralytics import YOLO
            import torch

            # Use yolov8n (nano) for speed - lightweight as requested
            # Options: yolov8n, yolov8s, yolov8m, yolov8l, yolov8x
            self._model = YOLO("yolov8n.pt")

            # Determine device
            if torch.cuda.is_available():
                self._device = "cuda"
            else:
                self._device = "cpu"

            logger.info(f"YOLOv8 model loaded on {self._device}")
        except Exception as e:
            logger.error(f"Failed to load YOLOv8 model: {e}")
            raise

    def detect_furniture(
        self,
        image: Image.Image,
        confidence_threshold: float = 0.3,
        iou_threshold: float = 0.5,
    ) -> list[dict]:
        """
        Detect furniture items in an image.

        Args:
            image: PIL Image to analyze
            confidence_threshold: Minimum confidence score (0-1)
            iou_threshold: IoU threshold for NMS

        Returns:
            List of detections, each with:
            - class_name: str (e.g., "chair", "couch")
            - confidence: float (0-1)
            - bbox: dict with x, y, width, height (normalized 0-1)
            - center: dict with x, y (normalized 0-1)
        """
        self._load_model()

        # Convert PIL image to numpy array
        img_array = np.array(image)

        # Run inference
        results = self._model(
            img_array,
            conf=confidence_threshold,
            iou=iou_threshold,
            device=self._device,
            verbose=False,
        )

        detections = []
        img_width, img_height = image.size

        for result in results:
            boxes = result.boxes
            if boxes is None:
                continue

            for i, box in enumerate(boxes):
                # Get class info
                class_id = int(box.cls[0])
                class_name = result.names[class_id]
                confidence = float(box.conf[0])

                # Filter to furniture classes only
                if class_name.lower() not in FURNITURE_CLASS_NAMES:
                    # Also check by class ID
                    if class_id not in FURNITURE_CLASSES:
                        continue

                # Get bounding box (xyxy format)
                x1, y1, x2, y2 = box.xyxy[0].tolist()

                # Calculate normalized coordinates (0-1)
                bbox = {
                    "x": x1 / img_width,
                    "y": y1 / img_height,
                    "width": (x2 - x1) / img_width,
                    "height": (y2 - y1) / img_height,
                }

                # Calculate center point (normalized 0-1)
                center = {
                    "x": (x1 + x2) / 2 / img_width,
                    "y": (y1 + y2) / 2 / img_height,
                }

                detections.append({
                    "class_name": class_name,
                    "confidence": round(confidence, 3),
                    "bbox": bbox,
                    "center": center,
                    "pixel_bbox": {
                        "x1": int(x1),
                        "y1": int(y1),
                        "x2": int(x2),
                        "y2": int(y2),
                    },
                })

        logger.info(f"Detected {len(detections)} furniture items")
        return detections

    def detect_from_base64(
        self,
        image_base64: str,
        confidence_threshold: float = 0.3,
        iou_threshold: float = 0.5,
    ) -> list[dict]:
        """
        Detect furniture from a base64-encoded image.

        Args:
            image_base64: Base64-encoded image (with or without data URI prefix)
            confidence_threshold: Minimum confidence score
            iou_threshold: IoU threshold for NMS

        Returns:
            List of furniture detections
        """
        # Remove data URI prefix if present
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]

        # Decode base64 to bytes
        image_bytes = base64.b64decode(image_base64)

        # Load as PIL Image
        image = Image.open(io.BytesIO(image_bytes))

        # Convert to RGB if necessary (e.g., RGBA from canvas)
        if image.mode != "RGB":
            image = image.convert("RGB")

        return self.detect_furniture(
            image,
            confidence_threshold=confidence_threshold,
            iou_threshold=iou_threshold,
        )

    def unload_model(self):
        """Unload the model to free memory."""
        if self._model is not None:
            del self._model
            self._model = None
            self._device = None

            # Clear CUDA cache if available
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass

            logger.info("YOLOv8 model unloaded")


# Singleton instance
yolo_service = YOLOService()
