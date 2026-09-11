import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import type { InvalidParam } from '@repo/shared';
import type { ZodError, ZodSchema } from 'zod';

/**
 * Validation error carrying RFC 9457 `invalidParams`. It is a plain class, not
 * an `HttpException`, so the global filter owns the whole response shape.
 */
export class ZodValidationError extends Error {
  constructor(readonly invalidParams: InvalidParam[]) {
    super('Request validation failed');
    this.name = 'ZodValidationError';
  }
}

export function toInvalidParams(error: ZodError): InvalidParam[] {
  return error.issues.map((issue) => ({
    name: issue.path.length > 0 ? issue.path.join('.') : '(body)',
    reason: issue.message,
  }));
}

/**
 * Parses a payload against a Zod schema and returns the *parsed* value, so
 * defaults and coercions reach the handler rather than the raw strings Express
 * produces for query parameters.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema?: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    if (!this.schema) return value;

    const result = this.schema.safeParse(value);
    if (!result.success) throw new ZodValidationError(toInvalidParams(result.error));

    return result.data;
  }
}
