/**
 * API client for communicating with the Depth Anything V3 backend
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function normalizeWsBaseUrl(raw: string): string {
  // Allow users to accidentally set http(s) here without breaking WebSocket construction.
  if (raw.startsWith('https://')) return raw.replace(/^https:\/\//, 'wss://');
  if (raw.startsWith('http://')) return raw.replace(/^http:\/\//, 'ws://');
  return raw;
}

function defaultWsBaseUrl(): string {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProtocol}//${window.location.host}`;
}

const WS_BASE_URL = normalizeWsBaseUrl(import.meta.env.VITE_WS_URL || defaultWsBaseUrl());

export function apiUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  const base = API_BASE_URL.replace(/\/+$/, ''); // Remove trailing slashes
  const path = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

// Auth token management
const TOKEN_KEY = 'epipar_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

function getAuthHeaders(): HeadersInit {
  const token = getStoredToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Auth types
export interface User {
  id: number;
  email: string;
  username: string;
  is_active: boolean;
  plan?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  email: string;
  username: string;
  password: string;
}

// Auth API functions
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Login failed' }));
    throw new Error(error.detail || 'Invalid email or password');
  }

  const data = await response.json();
  setStoredToken(data.access_token);
  return data;
}

export async function register(credentials: RegisterCredentials): Promise<AuthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Registration failed' }));
    throw new Error(error.detail || 'Registration failed');
  }

  const data = await response.json();
  setStoredToken(data.access_token);
  return data;
}

export async function getCurrentUser(): Promise<User | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: getAuthHeaders(),
    });

    if (!response.ok) {
      removeStoredToken();
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export function logout(): void {
  removeStoredToken();
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
  lod_level?: 'preview' | 'medium' | 'full' | null; // LOD level identifier
  point_count?: number; // Number of points in this LOD
  file_size_bytes?: number; // File size for download estimation
}

export interface LODAssetCollection {
  preview?: ModelAsset | null; // ~100K points, immediate load
  medium?: ModelAsset | null;  // ~1M points, background load
  full?: ModelAsset | null;    // ~10M points, on-demand load
}

export interface ProcessingResult {
  job_id: string;
  frames: DepthFrame[];
  camera_params: CameraParameters | null;
  model_asset?: ModelAsset | null; // Keep for backwards compat (returns full quality)
  lod_assets?: LODAssetCollection | null; // Multi-LOD assets for progressive loading
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
      ...getAuthHeaders(), // Include auth so backend can track scan counts
    },
    body: JSON.stringify({
      max_frames: options.maxFrames ?? 128,
      frame_interval: options.frameInterval,
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
  const wsUrl = `${WS_BASE_URL}/ws/${jobId}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('WebSocket connected', wsUrl);
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

// Furniture Search Types
export interface FurnitureProduct {
  rank: number;
  title: string;
  brand: string;
  price: string;
  availability: string;
  categories: string;
  similarity_score: number;
  asin: string;
  url?: string;
  imgUrl?: string;
  images?: string[];
  country?: string;
  is_sponsored?: boolean;
  sponsor_tier?: string;
}

export interface FilterOption {
  name: string;
  count: number;
}

export interface FurnitureFilters {
  brands: FilterOption[];
  countries: FilterOption[];
}

export interface FurnitureSearchResponse {
  query: string;
  results: FurnitureProduct[];
  count: number;
}

export interface FurnitureSearchRequest {
  query: string;
  top_k?: number;
}

/**
 * Search for furniture products using semantic similarity
 */
export async function searchFurniture(
  query: string,
  topK: number = 5,
  userCountry?: string
): Promise<FurnitureSearchResponse> {
  const url = `${API_BASE_URL}/api/furniture/search`;
  console.log('Furniture search URL:', url);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        top_k: topK,
        user_country: userCountry,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }));
      throw new Error(error.detail || `Failed to search furniture: ${response.status}`);
    }

    return response.json();
  } catch (err) {
    if (err instanceof TypeError && err.message === 'Failed to fetch') {
      throw new Error('Cannot connect to server. Please ensure the backend is running.');
    }
    throw err;
  }
}

/**
 * Get available filter options (brands and countries)
 */
export async function getFurnitureFilters(): Promise<FurnitureFilters> {
  const response = await fetch(`${API_BASE_URL}/api/furniture/filters`);

  if (!response.ok) {
    throw new Error('Failed to get furniture filters');
  }

  return response.json();
}

/**
 * Get furniture product by ASIN
 */
export async function getFurnitureProduct(asin: string): Promise<FurnitureProduct> {
  const response = await fetch(`${API_BASE_URL}/api/furniture/product/${asin}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Product not found' }));
    throw new Error(error.detail || 'Failed to get product');
  }

  return response.json();
}

/**
 * Get furniture search service stats
 */
export async function getFurnitureStats(): Promise<{
  total_products: number;
  unique_brands: number;
  unique_categories: number;
}> {
  const response = await fetch(`${API_BASE_URL}/api/furniture/stats`);

  if (!response.ok) {
    throw new Error('Failed to get furniture stats');
  }

  return response.json();
}

// Profile Types
export interface ProfileStats {
  scans_this_month: number;
  total_scans: number;
  storage_used: string;
  plan: string;
  plan_display: string;
  scans_limit: number;
  scans_reset_date: string | null;
}

export interface ActivityItem {
  id: number;
  action: string;
  description: string | null;
  icon: string;
  time_ago: string;
  created_at: string;
}

export interface ProfileResponse {
  id: number;
  email: string;
  username: string;
  is_active: boolean;
  created_at: string;
  plan: string;
  plan_display: string;
  stats: ProfileStats;
  recent_activities: ActivityItem[];
}

/**
 * Get current user's full profile with stats and recent activity
 */
export async function getProfile(): Promise<ProfileResponse> {
  const response = await fetch(`${API_BASE_URL}/api/profile`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get profile' }));
    throw new Error(error.detail || 'Failed to get profile');
  }

  return response.json();
}

/**
 * Get profile stats only
 */
export async function getProfileStats(): Promise<ProfileStats> {
  const response = await fetch(`${API_BASE_URL}/api/profile/stats`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get profile stats');
  }

  return response.json();
}

/**
 * Get user activities
 */
export async function getActivities(limit: number = 10): Promise<ActivityItem[]> {
  const response = await fetch(`${API_BASE_URL}/api/profile/activities?limit=${limit}`, {
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to get activities');
  }

  return response.json();
}

/**
 * Update user's subscription plan
 */
export async function updatePlan(plan: string): Promise<ProfileStats> {
  const response = await fetch(`${API_BASE_URL}/api/profile/plan`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ plan }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update plan' }));
    throw new Error(error.detail || 'Failed to update plan');
  }

  return response.json();
}

/**
 * Log a user activity
 */
export async function logActivity(
  action: string,
  description?: string,
  metadata?: Record<string, unknown>
): Promise<{ success: boolean; activity_id: number }> {
  const response = await fetch(`${API_BASE_URL}/api/profile/activity`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ action, description, metadata }),
  });

  if (!response.ok) {
    throw new Error('Failed to log activity');
  }

  return response.json();
}

/**
 * Increment scan count after a scan completes
 */
export async function incrementScan(
  storageBytes: number = 0
): Promise<{ success: boolean; scans_this_month: number; total_scans: number; storage_used: string }> {
  const response = await fetch(`${API_BASE_URL}/api/profile/increment-scan?storage_bytes=${storageBytes}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to increment scan' }));
    throw new Error(error.detail || 'Failed to increment scan');
  }

  return response.json();
}

/**
 * Log an export activity
 */
export async function logExport(format: string = 'ply'): Promise<{ success: boolean }> {
  const response = await fetch(`${API_BASE_URL}/api/profile/log-export?format=${format}`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    throw new Error('Failed to log export');
  }

  return response.json();
}

// ============================================================================
// Room API - Saved Rooms Management
// ============================================================================

export interface RoomAsset {
  filename: string;
  url: string;
  format: string;
  lod_level?: 'preview' | 'medium' | 'full' | null;
  file_size_bytes?: number;
}

export interface Room {
  id: number;
  user_id: number;
  name: string;
  description?: string | null;
  job_id?: string | null;
  frame_count?: number | null;
  point_count?: number | null;
  model_used?: string | null;
  original_width?: number | null;
  original_height?: number | null;
  file_size_bytes: number;
  file_size_display: string;
  thumbnail_url?: string | null;
  assets?: RoomAsset[] | null;
  created_at: string;
  updated_at?: string | null;
}

export interface RoomListResponse {
  rooms: Room[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface RoomCreateRequest {
  job_id: string;
  name: string;
  description?: string;
}

export interface RoomUpdateRequest {
  name?: string;
  description?: string;
}

/**
 * Get list of user's saved rooms with pagination
 */
export async function getRooms(page: number = 1, pageSize: number = 20): Promise<RoomListResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/rooms?page=${page}&page_size=${pageSize}`,
    { headers: getAuthHeaders() }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get rooms' }));
    throw new Error(error.detail || 'Failed to get rooms');
  }

  return response.json();
}

/**
 * Get a single room by ID
 */
export async function getRoom(roomId: number): Promise<Room> {
  const response = await fetch(
    `${API_BASE_URL}/api/rooms/${roomId}`,
    { headers: getAuthHeaders() }
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Room not found' }));
    throw new Error(error.detail || 'Room not found');
  }

  return response.json();
}

/**
 * Save a completed job as a room
 */
export async function saveRoom(data: RoomCreateRequest): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to save room' }));
    throw new Error(error.detail || 'Failed to save room');
  }

  return response.json();
}

/**
 * Update room metadata
 */
export async function updateRoom(roomId: number, data: RoomUpdateRequest): Promise<Room> {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update room' }));
    throw new Error(error.detail || 'Failed to update room');
  }

  return response.json();
}

/**
 * Delete a room
 */
export async function deleteRoom(roomId: number): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/rooms/${roomId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete room' }));
    throw new Error(error.detail || 'Failed to delete room');
  }
}

/**
 * Get room thumbnail URL
 */
export function getRoomThumbnailUrl(roomId: number): string {
  return `${API_BASE_URL}/api/rooms/${roomId}/thumbnail`;
}

/**
 * Get room asset URL
 */
export function getRoomAssetUrl(roomId: number, filename: string): string {
  return `${API_BASE_URL}/api/rooms/${roomId}/assets/${filename}`;
}

// ============================================================================
// YOLO Detection API - Furniture Detection from Screenshots
// ============================================================================

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PixelBoundingBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface FurnitureDetection {
  class_name: string;
  confidence: number;
  bbox: BoundingBox;
  center: Point2D;
  pixel_bbox: PixelBoundingBox;
}

export interface DetectFurnitureRequest {
  image_base64: string;
  confidence_threshold?: number;
  iou_threshold?: number;
}

export interface DetectFurnitureResponse {
  detections: FurnitureDetection[];
  image_width: number;
  image_height: number;
}

/**
 * Detect furniture items in an image (screenshot from 3D viewer)
 */
export async function detectFurniture(
  imageBase64: string,
  confidenceThreshold: number = 0.3,
  iouThreshold: number = 0.5
): Promise<DetectFurnitureResponse> {
  const response = await fetch(`${API_BASE_URL}/api/yolo/detect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      image_base64: imageBase64,
      confidence_threshold: confidenceThreshold,
      iou_threshold: iouThreshold,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Detection failed' }));
    throw new Error(error.detail || 'Failed to detect furniture');
  }

  return response.json();
}

/**
 * Check YOLO service status
 */
export async function getYoloStatus(): Promise<{ model_loaded: boolean; device: string | null }> {
  const response = await fetch(`${API_BASE_URL}/api/yolo/status`);

  if (!response.ok) {
    throw new Error('Failed to get YOLO status');
  }

  return response.json();
}

// ============================================================================
// Furniture Replacement API - AI-Powered Furniture Replacement in Images
// ============================================================================

export interface FurnitureReplacementRequest {
  room_image_base64: string;
  furniture_image_base64: string;
  furniture_description?: string;
  target_location?: string;
  style_hints?: string;
}

export interface FurnitureReplacementResult {
  generated_image_base64: string;
  generation_time_seconds?: number;
  model_used?: string;
  cache_hit?: boolean;
}

/**
 * Replace furniture in a room image using AI image generation
 */
export async function replaceFurnitureInImage(
  request: FurnitureReplacementRequest
): Promise<FurnitureReplacementResult> {
  const response = await fetch(`${API_BASE_URL}/api/image/replace-furniture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Furniture replacement failed' }));
    throw new Error(error.detail || 'Failed to replace furniture in image');
  }

  return response.json();
}

/**
 * Fetch an image URL and convert it to base64
 * Tries direct fetch first, falls back to proxy endpoint for CORS-restricted images
 */
export async function fetchImageAsBase64(imageUrl: string): Promise<string | null> {
  if (!imageUrl || imageUrl === 'N/A') {
    return null;
  }

  // Try direct fetch first
  try {
    const response = await fetch(imageUrl);
    if (response.ok) {
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // Direct fetch failed (likely CORS), try proxy
  }

  // Fall back to proxy endpoint
  try {
    const proxyResponse = await fetch(`${API_BASE_URL}/api/image/proxy`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url: imageUrl }),
    });

    if (proxyResponse.ok) {
      const data = await proxyResponse.json();
      return data.image_base64 || null;
    }
  } catch (proxyError) {
    console.error('Image proxy fetch failed:', proxyError);
  }

  return null;
}
