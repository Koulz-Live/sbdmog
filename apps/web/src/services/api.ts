// apps/web/src/services/api.ts
// Typed fetch wrapper for the /api/* Express backend.
// Authorization header is attached automatically from the Zustand auth store.

import { useAuthStore } from '../store/auth.store.js';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
}

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json() as { error?: string; message?: string };
      message = payload.error ?? payload.message ?? message;
    } catch {
      // ignore
    }
    throw new ApiError(response.status, message);
  }

  // 204 No Content
  if (response.status === 204) return undefined as T;

  return response.json() as Promise<T>;
}

// ── Convenience helpers ─────────────────────────────────────────────────────

export const apiGet  = <T>(path: string, init?: RequestOptions) =>
  apiFetch<T>(path, { method: 'GET', ...init });

export const apiPost = <T>(path: string, body?: unknown, init?: RequestOptions) =>
  apiFetch<T>(path, { method: 'POST', body, ...init });

export const apiPatch = <T>(path: string, body?: unknown, init?: RequestOptions) =>
  apiFetch<T>(path, { method: 'PATCH', body, ...init });

export const apiDelete = <T>(path: string, init?: RequestOptions) =>
  apiFetch<T>(path, { method: 'DELETE', ...init });
