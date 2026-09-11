import type { ErrorCode } from './error-code';

/**
 * RFC 9457 Problem Details. `code` and `traceId` are extension members, which
 * RFC 9457 section 3.2 permits explicitly.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance?: string;
  code: ErrorCode;
  traceId?: string;
  invalidParams?: InvalidParam[];
}

export interface InvalidParam {
  name: string;
  reason: string;
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

export function isProblemDetails(value: unknown): value is ProblemDetails {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.code === 'string'
  );
}
