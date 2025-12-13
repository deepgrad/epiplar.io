/**
 * Depth estimation service
 *
 * This module has been refactored to use a Python FastAPI backend running
 * Depth Anything V3 for improved accuracy and multi-view depth estimation.
 *
 * The utility functions (depthToPointCloud, depthMapToCanvas) are retained
 * for frontend visualization.
 */

import { ProcessingResult, DepthFrame, decodeFloat32Array } from './api';

export interface DepthEstimationResult {
  depthMap: Float32Array;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface ProcessingProgress {
  stage: string;
  progress: number;
  currentFrame?: number;
  totalFrames?: number;
  message?: string;
}

export interface CameraParameters {
  extrinsics: number[][][]; // [N, 3, 4]
  intrinsics: number[][][]; // [N, 3, 3]
}

/**
 * Convert backend ProcessingResult to frontend DepthEstimationResult format
 * This allows reuse of existing visualization code
 */
export function convertBackendResult(
  result: ProcessingResult
): DepthEstimationResult[] {
  return result.frames.map((frame: DepthFrame) => {
    const depthMap = decodeFloat32Array(frame.depth_map_b64);

    return {
      depthMap,
      width: frame.width,
      height: frame.height,
      originalWidth: result.original_width,
      originalHeight: result.original_height,
    };
  });
}

/**
 * Extract video frames as canvas elements (for color data)
 */
export async function extractVideoFrames(
  videoFile: File,
  maxFrames: number = 8,
  frameInterval: number = 30
): Promise<HTMLCanvasElement[]> {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(videoFile);
  video.muted = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
  });

  const fps = 30;
  const totalVideoFrames = Math.floor(video.duration * fps);
  const framesToExtract = Math.min(maxFrames, Math.ceil(totalVideoFrames / frameInterval));

  const frames: HTMLCanvasElement[] = [];

  for (let i = 0; i < framesToExtract; i++) {
    const frameTime = (i * frameInterval) / fps;
    video.currentTime = Math.min(frameTime, video.duration - 0.1);

    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(video, 0, 0);
    frames.push(canvas);
  }

  URL.revokeObjectURL(video.src);
  return frames;
}

/**
 * Convert depth map to point cloud data
 */
export function depthToPointCloud(
  depthResult: DepthEstimationResult,
  rgbData?: Uint8ClampedArray,
  focalLength: number = 500,
  maxPoints: number = 50000
): { positions: Float32Array; colors: Float32Array } {
  const { depthMap, width, height } = depthResult;

  // Calculate center
  const cx = width / 2;
  const cy = height / 2;

  // Calculate step for downsampling
  const totalPixels = width * height;
  const step = Math.max(1, Math.floor(Math.sqrt(totalPixels / maxPoints)));

  const pointCount = Math.ceil(width / step) * Math.ceil(height / step);
  const positions = new Float32Array(pointCount * 3);
  const colors = new Float32Array(pointCount * 3);

  let pointIndex = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = y * width + x;
      const depth = depthMap[idx];

      // Skip very far or invalid points
      if (depth < 0.01) continue;

      // Convert depth to actual depth (inverse relationship in monocular depth)
      // Depth Anything outputs inverse depth, so we need to invert
      const z = 1 / (depth + 0.1); // Add small value to avoid division by zero

      // Calculate 3D position
      const x3d = ((x - cx) * z) / focalLength;
      const y3d = ((y - cy) * z) / focalLength;

      const pIdx = pointIndex * 3;
      positions[pIdx] = x3d;
      positions[pIdx + 1] = -y3d; // Flip Y for proper orientation
      positions[pIdx + 2] = -z; // Negative Z for looking into the scene

      // Set colors (use RGB data if available, otherwise use depth-based coloring)
      if (rgbData) {
        const rgbIdx = idx * 4;
        colors[pIdx] = rgbData[rgbIdx] / 255;
        colors[pIdx + 1] = rgbData[rgbIdx + 1] / 255;
        colors[pIdx + 2] = rgbData[rgbIdx + 2] / 255;
      } else {
        // Color based on depth (rainbow gradient)
        const hue = depth * 0.7; // 0 to 0.7 (red to blue)
        const rgb = hslToRgb(hue, 0.8, 0.5);
        colors[pIdx] = rgb[0];
        colors[pIdx + 1] = rgb[1];
        colors[pIdx + 2] = rgb[2];
      }

      pointIndex++;
    }
  }

  // Trim arrays to actual point count
  return {
    positions: positions.slice(0, pointIndex * 3),
    colors: colors.slice(0, pointIndex * 3),
  };
}

/**
 * Convert HSL to RGB
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return [r, g, b];
}

/**
 * Get frame as ImageData for color extraction
 */
export async function extractFrameData(
  videoFile: File,
  timeInSeconds: number
): Promise<{ imageData: ImageData; canvas: HTMLCanvasElement }> {
  const video = document.createElement('video');
  video.src = URL.createObjectURL(videoFile);
  video.muted = true;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
  });

  video.currentTime = Math.min(timeInSeconds, video.duration - 0.1);
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve();
  });

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);

  URL.revokeObjectURL(video.src);

  return {
    imageData: ctx.getImageData(0, 0, canvas.width, canvas.height),
    canvas,
  };
}

/**
 * Create depth map visualization as canvas
 */
export function depthMapToCanvas(depthResult: DepthEstimationResult): HTMLCanvasElement {
  const { depthMap, width, height } = depthResult;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(width, height);

  for (let i = 0; i < depthMap.length; i++) {
    const depth = depthMap[i];
    const value = Math.floor(depth * 255);

    const idx = i * 4;
    imageData.data[idx] = value;     // R
    imageData.data[idx + 1] = value; // G
    imageData.data[idx + 2] = value; // B
    imageData.data[idx + 3] = 255;   // A
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}
