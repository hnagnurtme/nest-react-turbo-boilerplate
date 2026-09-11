import type { ProblemDetails } from '@repo/shared';

/**
 * Every HTTP error surfaces as one of these. UI code switches on `.code`,
 * never on `.message`/`detail` — `detail` is localised prose and will change
 * (doc 04 section 3.4).
 */
export class ProblemError extends Error {
  readonly problem: ProblemDetails;

  constructor(problem: ProblemDetails) {
    super(problem.detail);
    this.name = 'ProblemError';
    this.problem = problem;
  }

  get code(): ProblemDetails['code'] {
    return this.problem.code;
  }

  get status(): number {
    return this.problem.status;
  }

  get traceId(): string | undefined {
    return this.problem.traceId;
  }

  get invalidParams(): ProblemDetails['invalidParams'] {
    return this.problem.invalidParams;
  }
}

export function toProblemError(status: number, body: unknown): ProblemError {
  if (body && typeof body === 'object' && 'code' in body && 'title' in body) {
    return new ProblemError(body as ProblemDetails);
  }
  // The backend always returns RFC 9457; this branch only guards against a
  // response from something in front of it (proxy, CDN) that isn't our API.
  return new ProblemError({
    type: 'about:blank',
    title: 'Unexpected error',
    status,
    detail: 'The server returned a response the client could not understand.',
    code: 'INTERNAL_ERROR',
  });
}
