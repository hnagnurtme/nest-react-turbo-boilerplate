import { ERROR_CODES, type ErrorCode } from '@repo/shared';

/**
 * Base class for errors the domain raises deliberately.
 *
 * Carrying the `ErrorCode` and HTTP status on the error itself lets the global
 * filter translate without a chain of `instanceof` checks, and keeps services
 * free of `HttpException` — they should not know they are behind HTTP.
 */
export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly status: number;

  constructor(
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
    Error.captureStackTrace?.(this, new.target);
  }
}

/**
 * Thrown when a query is attempted with no tenant in the CLS store.
 * Fail-closed: better a 403 than a query that quietly spans every tenant.
 */
export class MissingTenantContextError extends AppError {
  readonly code = ERROR_CODES.TENANT_CONTEXT_REQUIRED;
  readonly status = 403;

  constructor() {
    super('No tenant context is bound to this execution');
  }
}

export class ResourceNotFoundError extends AppError {
  readonly code = ERROR_CODES.RESOURCE_NOT_FOUND;
  readonly status = 404;

  constructor(resourceType: string, resourceId?: string) {
    super(`${resourceType}${resourceId ? ` "${resourceId}"` : ''} was not found`, {
      resourceType,
      ...(resourceId === undefined ? {} : { resourceId }),
    });
  }
}

export class ResourceConflictError extends AppError {
  readonly code = ERROR_CODES.RESOURCE_CONFLICT;
  readonly status = 409;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message, details);
  }
}

export class ForbiddenActionError extends AppError {
  readonly code = ERROR_CODES.FORBIDDEN;
  readonly status = 403;

  constructor(action: string, subject: string) {
    // The message names the attempted action, never why it was denied: telling
    // a caller which rule blocked them leaks the authorisation model.
    super(`Not allowed to ${action} ${subject}`, { action, subject });
  }
}

export class UpstreamTimeoutError extends AppError {
  readonly code = ERROR_CODES.UPSTREAM_TIMEOUT;
  readonly status = 502;

  constructor(
    readonly upstream: string,
    timeoutMs: number,
  ) {
    super(`Upstream "${upstream}" did not respond within ${timeoutMs}ms`, { upstream, timeoutMs });
  }
}

export class InvalidCredentialsError extends AppError {
  readonly code = ERROR_CODES.INVALID_CREDENTIALS;
  readonly status = 401;

  constructor() {
    // Identical message for "no such email" and "wrong password" on purpose
    // (doc 03 section 4) — distinguishing them lets an attacker enumerate
    // registered accounts.
    super('Invalid email or password');
  }
}

export class RefreshTokenInvalidError extends AppError {
  readonly code = ERROR_CODES.UNAUTHENTICATED;
  readonly status = 401;

  constructor() {
    super('Refresh token is invalid or expired');
  }
}

/**
 * A refresh token that was already rotated came back a second time — the
 * strongest signal the rotation scheme (doc 03 section 3) exists to catch.
 * Either it leaked, or the legitimate client retried a request whose
 * response never arrived; either way every token in the family is revoked.
 */
export class TokenReuseDetectedError extends AppError {
  readonly code = ERROR_CODES.TOKEN_REUSE_DETECTED;
  readonly status = 401;

  constructor() {
    super('Refresh token reuse detected; the session has been revoked');
  }
}

export class CsrfValidationFailedError extends AppError {
  readonly code = ERROR_CODES.CSRF_VALIDATION_FAILED;
  readonly status = 403;

  constructor() {
    super('CSRF token missing or did not match');
  }
}

export class TenantAccessDeniedError extends AppError {
  readonly code = ERROR_CODES.TENANT_ACCESS_DENIED;
  readonly status = 403;

  constructor() {
    super('You do not have an active membership in this tenant');
  }
}
