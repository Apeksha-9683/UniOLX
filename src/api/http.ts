/**
 * Thin HTTP client for the UniOLX API.
 *
 * The base URL comes from `VITE_API_URL`. When it is not set the client uses
 * same-origin relative paths, which the Vite dev server proxies to the API.
 */

const API_BASE: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

const TOKEN_KEY = 'campus_mart_token';
const REFRESH_KEY = 'campus_mart_refresh';

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setTokens(accessToken: string | null, refreshToken?: string | null) {
  try {
    if (accessToken) {
      localStorage.setItem(TOKEN_KEY, accessToken);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    if (refreshToken) {
      localStorage.setItem(REFRESH_KEY, refreshToken);
    } else if (!accessToken) {
      localStorage.removeItem(REFRESH_KEY);
    }
  } catch {
    // ignore
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

export function clearTokens() {
  setTokens(null);
}

type QueryValue = string | number | boolean | undefined | null;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Record<string, QueryValue>;
  signal?: AbortSignal;
}

function buildUrl(path: string, params?: Record<string, QueryValue>): string {
  const base = API_BASE || '';
  const url = `${base}${path}`;
  if (!params) return url;

  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    search.append(key, String(value));
  });

  const query = search.toString();
  if (!query) return url;
  return url.includes('?') ? `${url}&${query}` : `${url}?${query}`;
}

async function parseError(response: Response): Promise<string> {
  try {
    const data = await response.json();
    const detail = (data as { detail?: unknown }).detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  } catch {
    // fall through to the generic message
  }
  return `Request failed (${response.status})`;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, params, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new ApiError(
      error instanceof Error ? error.message : 'Network error. Is the API running?',
      0
    );
  }

  if (response.status === 401) {
    clearTokens();
    throw new ApiError('Your session has expired. Please sign in again.', 401);
  }

  if (!response.ok) {
    throw new ApiError(await parseError(response), response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string, params?: Record<string, QueryValue>) =>
    request<T>(path, { method: 'GET', params }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
