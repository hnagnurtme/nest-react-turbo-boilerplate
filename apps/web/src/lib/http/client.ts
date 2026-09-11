import { configureApiContract, type ApiRequestConfig } from '@repo/api-contract';
import type { ApiResponse } from '@repo/shared';
import { env } from '@/config/env';
import { useTokenStore } from '@/lib/auth/token-store';
import { broadcastAuthEvent } from './broadcast';
import { toProblemError } from './problem-error';

const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Wired by app/session-expired-handler.tsx once React Router is mounted.
 * `lib` cannot import `entities`/`features` (doc 01 section 2.2), so the
 * richer "clear identity + navigate" behaviour lives at the `app` layer;
 * this client only ever touches its own layer's token store.
 */
let onSessionExpired: (() => void) | null = null;
export function setOnSessionExpired(fn: () => void): void {
  onSessionExpired = fn;
}

function buildUrl(url: string, params?: Record<string, unknown>): string {
  const full = new URL(url.replace(/^\//, ''), `${env.VITE_API_URL.replace(/\/?$/, '/')}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) full.searchParams.set(key, String(value));
    }
  }
  return full.toString();
}

async function rawRequest<T>(config: ApiRequestConfig, retried = false): Promise<T> {
  const { accessToken, csrfToken } = useTokenStore.getState();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  // Cross-site deployment (doc 03 section 2.1): the refresh cookie is
  // SameSite=None, which opens a CSRF surface. The synchronizer token the
  // server issued in the login/refresh response body closes it on every
  // state-changing call — NOT read from a cookie, since document.cookie
  // cannot see a cookie set by a different origin (see token-store.ts).
  if (config.method !== 'GET' && csrfToken) {
    headers[CSRF_HEADER_NAME] = csrfToken;
  }

  const response = await fetch(buildUrl(config.url, config.params), {
    method: config.method,
    headers,
    credentials: 'include', // ships the httpOnly refresh cookie cross-site
    body: config.data !== undefined ? JSON.stringify(config.data) : undefined,
    signal: config.signal,
  });

  if (response.status === 204) return undefined as T;

  const isProblem = response.headers.get('content-type')?.includes('application/problem+json');
  const body: unknown = await response.json().catch(() => null);

  if (!response.ok || isProblem) {
    const problem = toProblemError(response.status, body);

    // Never retry the refresh endpoint itself — that is how you get an
    // infinite loop instead of a logout (doc 04 section 3.3).
    const isRefreshCall = config.url.includes('/auth/refresh');
    if (problem.status === 401 && !retried && !isRefreshCall) {
      await ensureRefreshed();
      return rawRequest<T>(config, true);
    }

    if (problem.status === 401) {
      useTokenStore.getState().clearTokens();
      broadcastAuthEvent({ type: 'logout' });
      onSessionExpired?.();
    }

    // 403 is an authorization failure, not an expired token — refreshing
    // would not help and would just add noise (doc 04 section 3.3).
    throw problem;
  }

  const envelope = body as ApiResponse<unknown>;
  if (config.paginated) {
    return { items: envelope.data, meta: envelope.meta } as T;
  }
  return envelope.data as T;
}

let refreshPromise: Promise<void> | null = null;

/** Collapses concurrent 401s into a single call to /auth/refresh. */
function ensureRefreshed(): Promise<void> {
  refreshPromise ??= doRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function doRefresh(): Promise<void> {
  // The refresh call itself is CSRF-exempt-by-necessity on the client side
  // for the very first refresh after a hard reload (no csrfToken in memory
  // yet); the server accepts this because /auth/refresh with no matching
  // header simply 403s and the caller ends up logged out, same as any other
  // invalid-session outcome — there is no ambient authority being forged.
  const { csrfToken } = useTokenStore.getState();
  const response = await fetch(buildUrl('/auth/refresh'), {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { [CSRF_HEADER_NAME]: csrfToken } : {},
  });

  if (!response.ok) {
    useTokenStore.getState().clearTokens();
    broadcastAuthEvent({ type: 'logout' });
    onSessionExpired?.();
    throw new Error('Session expired');
  }

  const body = (await response.json()) as ApiResponse<{ accessToken: string; csrfToken: string }>;
  useTokenStore.getState().setTokens(body.data);
}

configureApiContract(rawRequest);
