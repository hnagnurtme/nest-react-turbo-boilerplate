import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CLIENT_TYPE_HEADER, CSRF_HEADER } from '../../common/constants';
import { AppConfig } from '../../config';
import { deriveCsrfToken } from '../auth/csrf-token.util';
import { CsrfValidationFailedError } from '../errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const REFRESH_COOKIE_NAME = 'refresh_token';
/**
 * These two are exempt from the synchronizer-token check specifically
 * (Origin validation below still applies to them): a browser reload wipes
 * the in-memory csrfToken but keeps the httpOnly refresh cookie, so the
 * very first `/auth/refresh` after a reload has no token to present yet.
 * Requiring one would make silent session restore impossible.
 */
const TOKEN_CHECK_EXEMPT_PATHS = ['/auth/refresh', '/auth/logout'];

/**
 * Two independent layers (doc 03 section 2.2), not one:
 *
 * 1. Origin/Referer allowlist — browsers do not let a page or a form spoof
 *    this header, so it is a sufficient defense on its own and, critically,
 *    does not depend on any state the client set up beforehand.
 * 2. Synchronizer CSRF token — recomputed from the httpOnly refresh cookie
 *    (core/auth/csrf-token.util.ts) and compared against the header. Kept
 *    as defense-in-depth for the endpoints where the client is guaranteed
 *    to already hold a token (everything except refresh/logout — see
 *    TOKEN_CHECK_EXEMPT_PATHS above for why those two are the exception).
 *
 * `/auth/login` is exempt from both: no refresh cookie exists yet at that
 * point, and login is credential-based, not cookie-ambient-authority based.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  constructor(private readonly config: AppConfig) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    // A native app has no browser to mediate an ambient-cookie CSRF attack
    // in the first place — it authenticates the refresh call with a token
    // it holds itself, never a cookie (doc 03 section 1.2).
    const isMobile = req.header(CLIENT_TYPE_HEADER) === 'mobile';
    if (SAFE_METHODS.has(req.method) || req.path.endsWith('/auth/login') || isMobile) {
      next();
      return;
    }

    this.assertTrustedOrigin(req);

    if (!TOKEN_CHECK_EXEMPT_PATHS.some((path) => req.path.endsWith(path))) {
      this.assertSynchronizerToken(req);
    }

    next();
  }

  private assertTrustedOrigin(req: Request): void {
    const origin = req.header('origin');
    // No Referer fallback: Origin is sent on every fetch()/XHR that
    // credentials:'include' requires anyway, so its absence here is itself
    // suspicious rather than something to work around.
    if (!origin || !this.config.corsOrigins.includes(origin)) {
      throw new CsrfValidationFailedError();
    }
  }

  private assertSynchronizerToken(req: Request): void {
    const refreshCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE_NAME];
    const presentedCsrf = req.header(CSRF_HEADER);

    if (!refreshCookie || !presentedCsrf) {
      throw new CsrfValidationFailedError();
    }

    const expected = deriveCsrfToken(this.config.jwt.refreshSecret, refreshCookie);
    if (expected !== presentedCsrf) {
      throw new CsrfValidationFailedError();
    }
  }
}
