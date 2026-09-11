/** Header the API always answers with so a user can quote it to support. */
export const TRACE_ID_HEADER = 'x-trace-id';

/** Inbound W3C Trace Context header (doc 10 section 3.1). */
export const TRACEPARENT_HEADER = 'traceparent';

export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';
export const CSRF_HEADER = 'x-csrf-token';
export const CLIENT_TYPE_HEADER = 'x-client-type';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
/** Hard ceiling: an unbounded `limit` is a denial-of-service vector. */
export const MAX_PAGE_SIZE = 100;

export const SORT_DIRECTIONS = ['asc', 'desc'] as const;
export type SortDirection = (typeof SORT_DIRECTIONS)[number];

export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** `field` or `field:asc` / `field:desc`. */
export const SORT_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*(?::(?:asc|desc))?$/;

/** Problem Details `type` URIs are built from this base plus the error code. */
export const ERROR_TYPE_BASE_URI = 'https://errors.boilerplate.dev/';
