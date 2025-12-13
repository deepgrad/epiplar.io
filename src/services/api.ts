/**
 * API client for communicating with the Depth Anything V3 backend
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export function apiUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  return `${API_BASE_URL}${pathOrUrl}`;
}

// Types matching backend schemas
export interface ProgressUpdate {
  stage: string;
  progress: number;
  current_frame?: number;
  total_frames?: number;
  message: string;
}

export interface DepthFrame {
  frame_index: number;
  depth_map_b64: string;
  width: number;
  height: number;
  confidence_b64?: string;
}

export interface CameraParameters {
  extrinsics: number[][][]; // [N, 3, 4]
  intrinsics: number[][][]; // [N, 3, 3]
}

export interface ModelAsset {
  filename: string;
  url: string; // relative URL from backend
  format: string; // "glb", "ply", ...
}

export interface ProcessingResult {
  job_id: string;
  frames: DepthFrame[];
  camera_params: CameraParameters | null;
  model_asset?: ModelAsset | null;
  original_width: number;
  original_height: number;
  model_used: string;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'uploaded' | 'processing' | 'completed' | 'failed';
  progress?: ProgressUpdate;
  error?: string;
}

export interface ProcessOptions {
  maxFrames?: number;
  frameInterval?: number;
}

/**
 * Upload a video file to the backend
 */
export async function uploadVideo(file: File): Promise<{ jobId: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/api/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(error.detail || 'Failed to upload video');
  }

  const data = await response.json();
  return { jobId: data.job_id };
}

/**
 * Start processing a previously uploaded video
 */
export async function startProcessing(
  jobId: string,
  options: ProcessOptions = {}
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/process/${jobId}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      max_frames: options.maxFrames ?? 16,
      frame_interval: options.frameInterval ?? 30,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Processing failed' }));
    throw new Error(error.detail || 'Failed to start processing');
  }
}

/**
 * Get the current status of a job
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const response = await fetch(`${API_BASE_URL}/api/status/${jobId}`);

  if (!response.ok) {
    throw new Error('Failed to get job status');
  }

  return response.json();
}

/**
 * Get the processing result
 */
export async function getResult(jobId: string): Promise<ProcessingResult> {
  const response = await fetch(`${API_BASE_URL}/api/result/${jobId}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get result' }));
    throw new Error(error.detail || 'Failed to get result');
  }

  return response.json();
}

/**
 * Cancel and cleanup a job
 */
export async function cancelJob(jobId: string): Promise<void> {
  await fetch(`${API_BASE_URL}/api/job/${jobId}`, {
    method: 'DELETE',
  });
}

/**
 * WebSocket message types
 */
type WSMessage =
  | { type: 'progress'; data: ProgressUpdate }
  | { type: 'complete'; data: ProcessingResult }
  | { type: 'error'; data: { message: string } };

/**
 * Connect to WebSocket for real-time progress updates
 */
export function connectProgressWebSocket(
  jobId: string,
  onProgress: (update: ProgressUpdate) => void,
  onComplete: (result: ProcessingResult) => void,
  onError: (error: Error) => void
): WebSocket {
  const ws = new WebSocket(`${WS_BASE_URL}/ws/${jobId}`);

  ws.onopen = () => {
    console.log('WebSocket connected');
  };

  ws.onmessage = (event) => {
    try {
      const message: WSMessage = JSON.parse(event.data);

      switch (message.type) {
        case 'progress':
          onProgress(message.data);
          break;
        case 'complete':
          onComplete(message.data);
          ws.close();
          break;
        case 'error':
          onError(new Error(message.data.message));
          ws.close();
          break;
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  ws.onerror = (event) => {
    console.error('WebSocket error:', event);
    onError(new Error('WebSocket connection error'));
  };

  ws.onclose = (event) => {
    if (!event.wasClean) {
      console.warn('WebSocket closed unexpectedly');
    }
  };

  return ws;
}

/**
 * Decode base64-encoded Float32Array
 */
export function decodeFloat32Array(base64: string): Float32Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Float32Array(bytes.buffer);
}

/**
 * Check if the backend is healthy
 */
export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
