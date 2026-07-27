const base = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:5050/api";
let accessToken: string | null = null;

export type Session = { accessToken: string; user: { id: string; email: string; name: string | null } };
export type Overview = { metrics: { label: string; value: string | number }[]; recentUsers: { id: string; email: string; name: string | null; createdAt: string }[] };
export type LoginHistoryEvent = { action: 'identity.registered' | 'identity.logged_in'; createdAt: string };
export type SystemLogEvent = { id: string; severity: 'info' | 'warning' | 'error'; category: 'security' | 'access' | 'api' | 'health' | 'runtime'; message: string; requestId: string | null; path: string | null; statusCode: number | null; metadata: Record<string, unknown> | null; createdAt: string; actor: { id: string; email: string; name: string | null } | null };

export const token = () => accessToken;
export const clear = () => { accessToken = null; };
export const save = (session: Session) => { accessToken = session.accessToken; };

async function refreshAccessToken() {
  const response = await fetch(`${base}/auth/refresh`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
  if (!response.ok) return false;
  save(await response.json() as Session);
  return true;
}
export const restoreSession = refreshAccessToken;

export async function api<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const response = await fetch(`${base}${path}`, { ...options, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...options.headers } });
  if (response.status === 401 && !retried && path !== '/auth/refresh' && await refreshAccessToken()) return api<T>(path, options, true);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message[0] : body.message || 'Unable to complete that request.');
  return body as T;
}
