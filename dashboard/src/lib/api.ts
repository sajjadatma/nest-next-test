import axios, { AxiosError, type AxiosRequestConfig, type Method } from "axios";
import { useSessionStore } from "@/stores/session-store";

const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5050/api";
const client = axios.create({ baseURL: base, withCredentials: true, headers: { "Content-Type": "application/json" } });

export type Session = { accessToken: string; user: { id: string; email: string; name: string | null } };
export type Overview = { metrics: { label: string; value: string | number }[]; recentUsers: { id: string; email: string; name: string | null; createdAt: string }[] };
export type LoginHistoryEvent = { action: 'identity.registered' | 'identity.logged_in'; createdAt: string };
export type SystemLogEvent = { id: string; severity: 'info' | 'warning' | 'error'; category: 'security' | 'access' | 'api' | 'health' | 'runtime'; message: string; requestId: string | null; path: string | null; statusCode: number | null; metadata: Record<string, unknown> | null; createdAt: string; actor: { id: string; email: string; name: string | null } | null };

export const token = () => useSessionStore.getState().accessToken;
export const clear = () => useSessionStore.getState().clear();
export const save = (session: Session) => useSessionStore.getState().setSession(session);

async function refreshAccessToken() {
  const response = await client.post<Session>("/auth/refresh").catch(() => null);
  if (!response) return false;
  const session = response.data;
  // A visitor without a refresh cookie receives a successful, informational
  // response. It is not an authenticated session and must not trigger a
  // follow-up request to a protected endpoint.
  if (!session?.accessToken) return false;
  save(session);
  return true;
}
export const restoreSession = refreshAccessToken;

export async function api<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const config: AxiosRequestConfig = {
    url: path,
    method: (options.method ?? "GET") as Method,
    headers: { ...(options.headers ? Object.fromEntries(new Headers(options.headers).entries()) : {}), ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
    data: options.body,
    signal: options.signal ?? undefined,
  };
  try {
    const response = await client.request<T>(config);
    return response.data;
  } catch (reason) {
    const status = reason instanceof AxiosError ? reason.response?.status : undefined;
    if (status === 401 && !retried && path !== "/auth/refresh" && await refreshAccessToken()) return api<T>(path, options, true);
    const body = reason instanceof AxiosError ? reason.response?.data : undefined;
    const message = Array.isArray(body?.message) ? body.message[0] : body?.message;
    throw new Error(message || (reason instanceof Error ? reason.message : "Unable to complete that request."));
  }
}
