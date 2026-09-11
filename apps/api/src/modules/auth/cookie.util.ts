import type { CookieOptions, Response } from 'express';
import { parseDuration } from '../../common/utils';
import { AppConfig } from '../../config';

const REFRESH_COOKIE_NAME = 'refresh_token';

/**
 * Only the refresh token needs a cookie. The CSRF value travels in the
 * response body instead (see modules/auth/auth.service.ts's IssuedTokens
 * doc comment for why: a JS-readable CSRF cookie cannot work across the
 * origins this project's cross-site deployment uses).
 *
 * Path is API-wide, NOT narrowed to /auth: CsrfMiddleware has to read this
 * same cookie on every mutating endpoint (e.g. POST /items) to recompute
 * the expected CSRF value, so the browser must attach it there too. This
 * costs nothing extra in practice — the cookie is httpOnly, so narrowing
 * its path was never protecting its VALUE (XSS can't read it either way),
 * only trimming which requests carry it.
 */
export function setRefreshCookie(
  res: Response,
  config: AppConfig,
  refreshToken: string,
  apiPrefix: string,
): void {
  const options: CookieOptions = {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: `/${apiPrefix}`,
    maxAge: parseDuration(config.jwt.refreshTtl),
  };
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, options);
}

export function clearRefreshCookie(res: Response, config: AppConfig, apiPrefix: string): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: config.cookie.secure,
    sameSite: config.cookie.sameSite,
    domain: config.cookie.domain,
    path: `/${apiPrefix}`,
  });
}

export function readRefreshCookie(cookies: Record<string, string> | undefined): string | undefined {
  return cookies?.[REFRESH_COOKIE_NAME];
}
