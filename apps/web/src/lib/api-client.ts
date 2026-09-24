import axios, { AxiosError, type AxiosInstance, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import type { Paginated } from '@society-erp/shared';
import { useAuthStore } from '@/stores/auth.store';
import { tokenStorage } from '@/lib/storage';

export class ApiError extends Error {
  code: string;
  status: number;
  fields?: Record<string, string[]>;
  details?: Record<string, unknown>;
  requestId?: string;
  constructor(input: { code: string; message: string; status: number; fields?: Record<string, string[]>; details?: Record<string, unknown>; requestId?: string }) {
    super(input.message);
    this.name = 'ApiError';
    this.code = input.code;
    this.status = input.status;
    this.fields = input.fields;
    this.details = input.details;
    this.requestId = input.requestId;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isCancel(err)) return new ApiError({ code: 'CANCELLED', message: 'Request cancelled', status: 0 });
  const ax = err as AxiosError<any>;
  if (ax?.isAxiosError) {
    if (!ax.response) return new ApiError({ code: ax.code === 'ECONNABORTED' ? 'TIMEOUT' : 'NETWORK_ERROR', message: ax.code === 'ECONNABORTED' ? 'The request timed out. Please try again.' : 'Network error. Check your connection and try again.', status: 0 });
    const body = ax.response.data ?? {};
    return new ApiError({ code: body.code ?? `HTTP_${ax.response.status}`, message: body.message ?? ax.message, status: ax.response.status, fields: body.fields, details: body.details, requestId: body.requestId });
  }
  return new ApiError({ code: 'UNKNOWN', message: (err as Error)?.message ?? 'Something went wrong', status: 0 });
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean; _networkRetries?: number };

/**
 * Origin of the API. Empty means same origin, which covers the dev proxy, the nginx image and any
 * single-origin deploy. Set `VITE_API_URL` at build time when the web app is hosted separately from
 * the API (a static site on Vercel or Render talking to the API service on its own domain); that
 * origin must then be listed in the API's `CORS_ORIGINS`.
 */
export const API_ORIGIN = (import.meta.env.VITE_API_URL ?? '').trim().replace(/\/+$/, '');

export const api: AxiosInstance = axios.create({ baseURL: `${API_ORIGIN}/api/v1`, timeout: 30_000, headers: { Accept: 'application/json' } });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  config.headers['X-Request-Id'] = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

/** Exchanges the stored refresh token for a new pair. Single-flight so parallel 401s share one refresh. */
export function refreshSession(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  const refreshToken = tokenStorage.getRefresh();
  if (!refreshToken) return Promise.resolve(null);
  refreshPromise = axios
    .post('/api/v1/auth/refresh', { refreshToken }, { timeout: 15_000 })
    .then((res) => {
      const data = res.data?.data as { accessToken: string; refreshToken: string };
      useAuthStore.getState().setSession({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken;
    })
    .catch(() => {
      useAuthStore.getState().clear();
      return null;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

const SESSION_END_CODES = new Set(['SESSION_REVOKED', 'TOKEN_REUSED', 'ACCOUNT_INACTIVE']);

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<any>) => {
    const config = error.config as RetriableConfig | undefined;
    // safe network retry for idempotent reads
    if (!error.response && config && (config.method ?? 'get').toLowerCase() === 'get' && !axios.isCancel(error) && error.code !== 'ECONNABORTED') {
      config._networkRetries = (config._networkRetries ?? 0) + 1;
      if (config._networkRetries <= 2) {
        await new Promise((r) => setTimeout(r, 400 * config._networkRetries!));
        return api(config);
      }
    }
    if (error.response?.status === 401 && config && !config._retry) {
      const code = error.response.data?.code;
      if (code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED' || code === 'TOKEN_INVALID') {
        if (code === 'TOKEN_INVALID' && !useAuthStore.getState().accessToken) throw toApiError(error);
        const token = await refreshSession();
        if (token) {
          config._retry = true;
          config.headers.Authorization = `Bearer ${token}`;
          return api(config);
        }
      }
      if (SESSION_END_CODES.has(code)) useAuthStore.getState().clear();
    }
    throw toApiError(error);
  },
);

export type PageResult<T> = Paginated<T>;

/** Typed transport helpers. Pages/hooks never import axios directly. */
export const http = {
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await api.get(url, config);
    return res.data?.data as T;
  },
  async getWithMeta<T, M = Record<string, unknown>>(url: string, config?: AxiosRequestConfig): Promise<{ data: T; meta: M }> {
    const res = await api.get(url, config);
    return { data: res.data?.data as T, meta: (res.data?.meta ?? {}) as M };
  },
  async getPage<T>(url: string, params?: Record<string, unknown>, config?: AxiosRequestConfig): Promise<PageResult<T>> {
    const res = await api.get(url, { ...config, params });
    const meta = res.data?.meta ?? {};
    return { items: res.data?.data ?? [], total: meta.total ?? 0, page: meta.page ?? 1, limit: meta.limit ?? 20, pages: meta.pages ?? 1 };
  },
  async post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await api.post(url, body, config);
    return res.data?.data as T;
  },
  async patch<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await api.patch(url, body, config);
    return res.data?.data as T;
  },
  async put<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const res = await api.put(url, body, config);
    return res.data?.data as T;
  },
  async delete<T = void>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const res = await api.delete(url, config);
    return res.data?.data as T;
  },
  async blob(url: string, config?: AxiosRequestConfig): Promise<{ blob: Blob; filename: string | null }> {
    const res = await api.get(url, { ...config, responseType: 'blob' });
    const disposition = res.headers['content-disposition'] as string | undefined;
    const match = disposition?.match(/filename="?([^";]+)"?/);
    return { blob: res.data as Blob, filename: match?.[1] ?? null };
  },
  async upload<T>(url: string, form: FormData, config?: AxiosRequestConfig): Promise<T> {
    const res = await api.post(url, form, { ...config, headers: { ...(config?.headers ?? {}), 'Content-Type': 'multipart/form-data' } });
    return res.data?.data as T;
  },
};
