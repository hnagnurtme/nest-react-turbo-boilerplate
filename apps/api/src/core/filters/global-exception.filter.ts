import {
  Catch,
  HttpException,
  Inject,
  HttpStatus,
  Injectable,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { ForbiddenError } from '@casl/ability';
import {
  ERROR_CODES,
  PROBLEM_CONTENT_TYPE,
  type ErrorCode,
  type InvalidParam,
  type ProblemDetails,
} from '@repo/shared';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ZodError } from 'zod';
import { ERROR_TYPE_BASE_URI, TRACE_ID_HEADER } from '../../common/constants';
import { AppError } from '../errors';
import { ZodValidationError, toInvalidParams } from '../pipes/zod-validation.pipe';
import { getActiveTraceId } from '../telemetry/trace.util';

interface Mapped {
  status: number;
  code: ErrorCode;
  detail: string;
  invalidParams?: InvalidParam[];
}

/** Postgres SQLSTATE codes the API translates into client-meaningful answers. */
const PG_ERROR_MAP: Record<string, { status: number; code: ErrorCode; detail: string }> = {
  '23505': {
    status: HttpStatus.CONFLICT,
    code: ERROR_CODES.RESOURCE_CONFLICT,
    detail: 'A resource with the same unique value already exists',
  },
  '23503': {
    status: HttpStatus.CONFLICT,
    code: ERROR_CODES.REFERENCE_CONSTRAINT,
    detail: 'A referenced resource does not exist or is still in use',
  },
};

const TIMEOUT_SYSCALL_CODES = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'ECONNABORTED']);

const STATUS_CODE_FALLBACK: Record<number, ErrorCode> = {
  400: ERROR_CODES.MALFORMED_REQUEST,
  401: ERROR_CODES.UNAUTHENTICATED,
  403: ERROR_CODES.FORBIDDEN,
  404: ERROR_CODES.RESOURCE_NOT_FOUND,
  409: ERROR_CODES.RESOURCE_CONFLICT,
  422: ERROR_CODES.VALIDATION_FAILED,
  429: ERROR_CODES.RATE_LIMIT_EXCEEDED,
  502: ERROR_CODES.UPSTREAM_UNAVAILABLE,
  504: ERROR_CODES.UPSTREAM_TIMEOUT,
};

function titleFromCode(code: ErrorCode): string {
  return code
    .toLowerCase()
    .split('_')
    .map((word) => (word.length > 0 ? word[0]?.toUpperCase() + word.slice(1) : word))
    .join(' ');
}

function hasStringProp<K extends string>(value: unknown, key: K): value is Record<K, string> {
  return typeof value === 'object' && value !== null && typeof (value as Record<K, unknown>)[key] === 'string';
}

/**
 * Every error leaving the API becomes RFC 9457 Problem Details
 * (doc 02 section 3.2). The infrastructure mapping table lives here and only
 * here, so a driver-specific code never has to be understood twice.
 */
@Catch()
@Injectable()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
    this.logger.setContext(GlobalExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const mapped = this.map(exception);
    const traceId = getActiveTraceId();

    const problem: ProblemDetails = {
      type: `${ERROR_TYPE_BASE_URI}${mapped.code}`,
      title: titleFromCode(mapped.code),
      status: mapped.status,
      detail: mapped.detail,
      instance: request.originalUrl,
      code: mapped.code,
      ...(traceId ? { traceId } : {}),
      ...(mapped.invalidParams ? { invalidParams: mapped.invalidParams } : {}),
    };

    // 5xx means the system failed and someone should look; 4xx means the client
    // sent something wrong, which is the system working as designed.
    const logPayload = { err: exception, code: mapped.code, status: mapped.status, traceId };
    if (mapped.status >= 500) {
      this.logger.error(logPayload, 'Request failed');
    } else {
      this.logger.warn(logPayload, 'Request rejected');
    }

    if (traceId) response.setHeader(TRACE_ID_HEADER, traceId);
    response.status(mapped.status).type(PROBLEM_CONTENT_TYPE).send(problem);
  }

  private map(exception: unknown): Mapped {
    if (exception instanceof ZodValidationError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ERROR_CODES.VALIDATION_FAILED,
        detail: 'The request payload failed validation',
        invalidParams: exception.invalidParams,
      };
    }

    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: ERROR_CODES.VALIDATION_FAILED,
        detail: 'The request payload failed validation',
        invalidParams: toInvalidParams(exception),
      };
    }

    // Covers MissingTenantContextError, ResourceNotFoundError and friends:
    // each one already carries its own code and status.
    if (exception instanceof AppError) {
      return { status: exception.status, code: exception.code, detail: exception.message };
    }

    if (exception instanceof ForbiddenError) {
      return {
        status: HttpStatus.FORBIDDEN,
        code: ERROR_CODES.FORBIDDEN,
        detail: 'You are not allowed to perform this action',
      };
    }

    // `pg` surfaces SQLSTATE on `error.code`; drizzle re-throws it untouched.
    if (hasStringProp(exception, 'code')) {
      const pg = PG_ERROR_MAP[exception.code];
      if (pg) return pg;

      if (TIMEOUT_SYSCALL_CODES.has(exception.code)) {
        return {
          status: HttpStatus.BAD_GATEWAY,
          code: ERROR_CODES.UPSTREAM_TIMEOUT,
          detail: 'An upstream service did not respond in time',
        };
      }
    }

    if (exception instanceof HttpException) return this.fromHttpException(exception);

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ERROR_CODES.INTERNAL_ERROR,
      // Never `exception.message`: it leaks table names, SQL and file paths.
      detail: 'An unexpected error occurred',
    };
  }

  private fromHttpException(exception: HttpException): Mapped {
    const status = exception.getStatus();
    const body: unknown = exception.getResponse();

    const code =
      (hasStringProp(body, 'code') ? (body.code as ErrorCode) : undefined) ??
      STATUS_CODE_FALLBACK[status] ??
      (status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.MALFORMED_REQUEST);

    if (status >= 500) {
      return { status, code, detail: 'An unexpected error occurred' };
    }

    const detail = hasStringProp(body, 'message')
      ? body.message
      : typeof body === 'string'
        ? body
        : exception.message;

    return { status, code, detail };
  }
}
