import {
  Inject,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiResponse, PaginationMeta } from '@repo/shared';
import type { Response } from 'express';
import { map, type Observable } from 'rxjs';
import { TRACE_ID_HEADER } from '../../common/constants';
import { NO_ENVELOPE_KEY } from '../decorators';
import { getActiveTraceId } from '../telemetry/trace.util';

interface PaginatedShape {
  items: unknown;
  meta: PaginationMeta;
}

/** A handler that already returns `{ items, meta }` keeps its pagination meta. */
function isPaginated(value: unknown): value is PaginatedShape {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return 'items' in candidate && typeof candidate.meta === 'object' && candidate.meta !== null;
}

/** Streams must not be buffered into JSON. */
function isStream(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { pipe?: unknown }).pipe === 'function'
  );
}

/**
 * Wraps every successful body in `{ data, meta? }` (doc 02 section 3.1) and
 * always answers with `x-trace-id`, so a user can quote one id and support can
 * find the request in the logs.
 */
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, ApiResponse<unknown> | T> {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiResponse<unknown> | T> {
    const response = context.switchToHttp().getResponse<Response>();
    const traceId = getActiveTraceId();
    if (traceId) response.setHeader(TRACE_ID_HEADER, traceId);

    const skip = this.reflector.getAllAndOverride<boolean>(NO_ENVELOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    return next.handle().pipe(
      map((body): ApiResponse<unknown> | T => {
        // 204 has no body by definition; wrapping it would make it a 200.
        if (skip || body === undefined || response.statusCode === 204 || isStream(body)) {
          return body;
        }

        if (isPaginated(body)) return { data: body.items, meta: body.meta };

        return { data: body };
      }),
    );
  }
}
