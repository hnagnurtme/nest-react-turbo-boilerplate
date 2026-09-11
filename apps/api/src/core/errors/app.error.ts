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
