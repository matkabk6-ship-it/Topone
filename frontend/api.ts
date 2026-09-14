/**
 * Central API client for TOP ONE.
 *
 * Why this file exists:
 * React Native has no browser/webpage to resolve relative URLs like
 * fetch('/api/user/me') against — that only works on a website, where the
 * browser fills in the domain automatically. In the app it throws
 * "Invalid URL". Every API call must use a full URL (https://...),
 * so this file builds that full URL in one place.
 *
 * Setup required (one-time):
 * 1. Create a file named exactly ".env" in the "frontend" folder (same
 *    level as package.json) — NOT committed with real secrets if your repo
 *    is public, but the backend URL itself is not sensitive.
 * 2. Put this single line in it, replacing the example with your real
 *    backend URL (no trailing slash):
 *
 *      EXPO_PUBLIC_API_URL=https://your-backend-url.com
 *
 * Expo automatically exposes any variable prefixed with EXPO_PUBLIC_ to
 * your app code — no extra babel/config setup needed.
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL;

if (!API_BASE_URL) {
  console.warn(
    '[api] EXPO_PUBLIC_API_URL is not set. Add it to frontend/.env — see comment at the top of services/api.ts.'
  );
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  token?: string; // pass an auth token if the endpoint needs one
};

class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

/**
 * Builds a full, valid URL from a relative API path.
 * '/api/user/me'  ->  'https://your-backend-url.com/api/user/me'
 */
function buildUrl(path: string): string {
  if (!API_BASE_URL) {
    throw new Error(
      'API base URL is not configured. Set EXPO_PUBLIC_API_URL in frontend/.env'
    );
  }
  const cleanBase = API_BASE_URL.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

async function request<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { method = 'GET', body, headers = {}, token } = options;

  const finalHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    method,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : await response.text();

  if (!response.ok) {
    throw new ApiError(
      (data && (data as any).message) || `Request failed with status ${response.status}`,
      response.status,
      data
    );
  }

  return data as T;
}

export const api = {
  get: <T = unknown>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T = unknown>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T = unknown>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T = unknown>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T = unknown>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    request<T>(path, { ...options, method: 'DELETE' }),
};

/**
 * Example: fetch the current user.
 * Replace/extend this with whatever your backend's user endpoint returns.
 * Usage elsewhere in the app:
 *   import { getCurrentUser } from '../services/api';
 *   const user = await getCurrentUser(token);
 */
export async function getCurrentUser(token?: string) {
  return api.get('/api/user/me', { token });
}

export { ApiError };
