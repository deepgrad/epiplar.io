/**
 * API client for communicating with the Depth Anything V3 backend
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export function apiUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) return pathOrUrl;
  return `${API_BASE_URL}${pathOrUrl}`;
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
