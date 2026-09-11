import { createHash, createHmac } from 'node:crypto';

/**
 * Synchronizer CSRF token derived from the refresh token, not stored
 * anywhere separately (doc 03 section 2.2 — see the longer rationale on
 * `IssuedTokens.csrfToken` in modules/auth/auth.service.ts). Lives in
 * `core` so both the middleware that verifies it and the service that
 * issues it can import the exact same derivation without `core` reaching
 * into `modules` (doc 01 section 2.2 — core may not import modules).
 */
export function deriveCsrfToken(refreshSecret: string, rawRefreshToken: string): string {
  const tokenHash = createHash('sha256').update(rawRefreshToken).digest('hex');
  return createHmac('sha256', refreshSecret).update(tokenHash).digest('hex');
}
