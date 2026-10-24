import { AISearchResult, Listing, User } from '../types';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

function apiUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function authHeaders(): HeadersInit {
  const token = localStorage.getItem('campus_mart_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Backend request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export function isBackendConfigured(): boolean {
  return Boolean(import.meta.env.VITE_API_BASE_URL);
}

function normalizeUser(user: Partial<User> & { id: string; email: string }): User {
  return {
    id: user.id,
    name: user.name || user.email.split('@')[0],
    email: user.email,
    collegeId: user.collegeId || '',
    collegeName: user.collegeName || user.collegeId || '',
    collegeShortName: user.collegeShortName || user.collegeId || '',
    branch: user.branch || 'Undergraduate',
    year: user.year || 1,
    semester: user.semester || 1,
    avatar: user.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`,
    isVerified: user.isVerified ?? true,
    rating: user.rating || 5,
    totalReviews: user.totalReviews || 0,
    completedTrades: user.completedTrades || 0,
    joinedDate: user.joinedDate || new Date().toISOString()
  };
}

export async function searchWithBackend(query: string, collegeId?: string): Promise<AISearchResult> {
  return request<AISearchResult>('/api/rag/search', {
    method: 'POST',
    body: JSON.stringify({ query, college_id: collegeId })
  });
}

export async function getBackendListings(collegeId?: string): Promise<Listing[]> {
  const suffix = collegeId ? `?college_id=${encodeURIComponent(collegeId)}` : '';
  return request<Listing[]>(`/api/listings${suffix}`);
}

export async function getBackendUser(): Promise<User> {
  return request<User>('/api/me');
}

export async function backendLogin(email: string, password: string): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: User }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  return { ...result, user: normalizeUser(result.user) };
}

export async function backendRegister(payload: {
  name: string;
  email: string;
  password: string;
  collegeId: string;
  branch?: string;
}): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: User }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      college_id: payload.collegeId,
      branch: payload.branch
    })
  });
  return { ...result, user: normalizeUser(result.user) };
}
