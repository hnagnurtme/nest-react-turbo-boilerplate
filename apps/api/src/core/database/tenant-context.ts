import type { AuthContext } from '@repo/shared';
import type { ClsStore } from 'nestjs-cls';

/**
 * Keys stored in the CLS (AsyncLocalStorage) namespace for the current request.
 * They are constants rather than inline strings because a typo in a `cls.get`
 * returns `undefined` instead of failing — and an undefined tenantId is exactly
 * the condition the RLS design must never reach silently.
 */
export const CLS_KEYS = {
  tenantId: 'tenantId',
  userId: 'userId',
  traceId: 'traceId',
  authContext: 'authContext',
} as const;

export type ClsKey = (typeof CLS_KEYS)[keyof typeof CLS_KEYS];

/** Shape of the CLS store, for `ClsService<AppClsStore>`. */
export interface AppClsStore extends ClsStore {
  [CLS_KEYS.tenantId]?: string;
  [CLS_KEYS.userId]?: string;
  [CLS_KEYS.traceId]?: string;
  [CLS_KEYS.authContext]?: AuthContext;
}

/**
 * Name of the transaction-local Postgres setting every RLS policy reads.
 * Set with `set_config(..., true)` so it dies with the transaction and cannot
 * leak to the next request that borrows the same pooled connection.
 */
export const TENANT_SETTING = 'app.tenant_id';
