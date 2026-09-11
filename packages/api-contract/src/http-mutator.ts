/**
 * The function orval calls for every generated request. It stays a thin
 * pass-through to whatever HTTP client the consuming app registers via
 * `configureApiContract` — this package must not hardcode fetch/axios, a
 * base URL, or token storage, since the web app and the (future) mobile app
 * need different strategies for both (doc 04 section 3, doc 05).
 *
 * The registered function is expected to have ALREADY unwrapped the
 * `{ data, meta }` envelope (doc 02 section 3.1): callers of the generated
 * hooks receive the inner payload directly, never `response.data.data`.
 * Set `paginated: true` for list endpoints to receive `{ items, meta }`
 * instead of a bare array.
 */
export interface ApiRequestConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  params?: Record<string, unknown>;
  data?: unknown;
  paginated?: boolean;
  signal?: AbortSignal;
}

export type ApiRequestFn = <T>(config: ApiRequestConfig) => Promise<T>;

let activeRequestFn: ApiRequestFn | null = null;

/** Called once at app startup (apps/web/src/lib/http/client.ts). */
export function configureApiContract(fn: ApiRequestFn): void {
  activeRequestFn = fn;
}

export function apiMutator<T>(config: ApiRequestConfig): Promise<T> {
  if (!activeRequestFn) {
    throw new Error(
      '@repo/api-contract was used before configureApiContract() was called. ' +
        'Call it once during app bootstrap (see apps/web/src/lib/http/client.ts).',
    );
  }
  return activeRequestFn<T>(config);
}
