import { pipeline, env, RawImage, ProgressCallback } from '@huggingface/transformers';

// Configure transformers.js
env.allowLocalModels = false;
env.useBrowserCache = true;

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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let depthEstimator: any = null;
let isInitializing = false;

/**
 * Initialize the depth estimation model
 * Uses Depth Anything V2 Small for browser performance
 */
export async function initializeDepthEstimator(
  onProgress?: (progress: number) => void
): Promise<void> {
  if (depthEstimator) return;
  if (isInitializing) {
    // Wait for existing initialization
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  isInitializing = true;

  const progressCallback: ProgressCallback = (data) => {
    if (onProgress && 'progress' in data && typeof data.progress === 'number') {
      onProgress(data.progress);
    }
  };

  try {
    depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
      device: 'webgpu', // Use WebGPU if available, falls back to WASM
      progress_callback: progressCallback,
    });
  } catch (error) {
    console.warn('WebGPU not available, falling back to WASM:', error);
    // Fallback to WASM
    depthEstimator = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small', {
      device: 'wasm',
      progress_callback: progressCallback,
    });
  }

  isInitializing = false;
}

/**
 * Estimate depth for a single image/frame
 */
export async function estimateDepth(
  imageSource: string | HTMLImageElement | HTMLCanvasElement | ImageData
): Promise<DepthEstimationResult> {
  if (!depthEstimator) {
    await initializeDepthEstimator();
  }

  if (!depthEstimator) {
    throw new Error('Failed to initialize depth estimator');
  }

  // Convert to RawImage if needed
  let image: RawImage;
  if (typeof imageSource === 'string') {
    image = await RawImage.fromURL(imageSource);
  } else if (imageSource instanceof HTMLImageElement) {
    image = await RawImage.fromURL(imageSource.src);
  } else if (imageSource instanceof HTMLCanvasElement) {
    const dataUrl = imageSource.toDataURL('image/png');
    image = await RawImage.fromURL(dataUrl);
  } else if (imageSource instanceof ImageData) {
    image = new RawImage(
      new Uint8ClampedArray(imageSource.data),
      imageSource.width,
      imageSource.height,
      4
    );
  } else {
    throw new Error('Unsupported image source type');
  }

  const result = await depthEstimator(image);

  // The result can be an array or single object
  const output = Array.isArray(result) ? result[0] : result;
  const depthImage = output.depth as RawImage;

  // Convert depth data to Float32Array (normalized 0-1)
  const depthData = new Float32Array(depthImage.width * depthImage.height);
  const rawData = depthImage.data as Uint8Array;

  for (let i = 0; i < depthData.length; i++) {
    // Depth values are stored as grayscale (0-255), normalize to 0-1
    depthData[i] = rawData[i] / 255;
  }

  return {
    depthMap: depthData,
    width: depthImage.width,
    height: depthImage.height,
    originalWidth: image.width,
    originalHeight: image.height,
  };
}

/**
 * Extract frames from video and estimate depth for each
 */
export async function processVideoForDepth(
  videoFile: File,
  options: {
    maxFrames?: number;
    frameInterval?: number; // Extract every Nth frame
    onProgress?: (progress: ProcessingProgress) => void;
  } = {}
): Promise<DepthEstimationResult[]> {
  const { maxFrames = 10, frameInterval = 30, onProgress } = options;

  // Create video element
  const video = document.createElement('video');
  video.src = URL.createObjectURL(videoFile);
  video.muted = true;

  // Wait for video to load
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  const fps = 30; // Assume 30fps
  const totalVideoFrames = Math.floor(video.duration * fps);
  const framesToExtract = Math.min(maxFrames, Math.ceil(totalVideoFrames / frameInterval));

  onProgress?.({
    stage: 'Initializing depth model',
    progress: 0,
  });

  // Initialize model
  await initializeDepthEstimator((p) => {
    onProgress?.({
      stage: 'Loading AI model',
      progress: p * 0.2, // Model loading is 20% of total
    });
  });

  const results: DepthEstimationResult[] = [];

  for (let i = 0; i < framesToExtract; i++) {
    const frameTime = (i * frameInterval) / fps;

    // Seek to frame
    video.currentTime = Math.min(frameTime, video.duration - 0.1);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });

    // Draw frame to canvas
    ctx.drawImage(video, 0, 0);

    onProgress?.({
      stage: 'Processing frames',
      progress: 20 + ((i / framesToExtract) * 70), // Frame processing is 70% of total
      currentFrame: i + 1,
      totalFrames: framesToExtract,
    });

    // Estimate depth
    const depthResult = await estimateDepth(canvas);
    results.push(depthResult);
  }

  // Cleanup
  URL.revokeObjectURL(video.src);

  onProgress?.({
    stage: 'Complete',
    progress: 100,
  });

  return results;
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
