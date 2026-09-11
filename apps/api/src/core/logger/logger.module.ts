import { RequestMethod } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { LoggerModule } from 'nestjs-pino';
import { ClsService } from 'nestjs-cls';
import { getEnv } from '../../config';
import { CLS_KEYS, type AppClsStore } from '../database/tenant-context';

/**
 * Pino wired to the request context (doc 06 section 1.1).
 *
 * The mixin runs for every log line, so correlation is automatic: nobody has to
 * remember to pass `traceId`, and nobody can forget. The active OTel span wins
 * over the CLS value because it is also what the collector sees.
 */
export const AppLoggerModule = LoggerModule.forRootAsync({
  inject: [ClsService],
  useFactory: (cls: ClsService<AppClsStore>) => {
    const env = getEnv();

    return {
      // Explicit route match: nestjs-pino's default '*' is Express 4 syntax and
      // makes Express 5 warn on every boot.
      forRoutes: [{ path: '{*path}', method: RequestMethod.ALL }],
      pinoHttp: {
        level: env.LOG_LEVEL,

        mixin: () => {
          const span = trace.getActiveSpan();
          return {
            traceId: span?.spanContext().traceId ?? cls.get(CLS_KEYS.traceId),
            tenantId: cls.get(CLS_KEYS.tenantId),
            userId: cls.get(CLS_KEYS.userId),
          };
        },

        // Redaction is enumerate-what-to-hide: every new sensitive DTO field
        // must be added here, and doc 09 has a test that catches omissions.
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'req.headers["x-csrf-token"]',
            'req.headers["x-signature"]',
            '*.password',
            '*.passwordHash',
            '*.refreshToken',
            '*.accessToken',
            '*.token',
            '*.tokenHash',
            '*.secret',
            '*.apiKey',
            '*.creditCard',
          ],
          censor: '[REDACTED]',
        },

        // 4xx is the system behaving correctly against a bad request; only 5xx
        // should be able to page someone.
        customLogLevel: (_req, res, err) =>
          err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',

        transport: env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
      },
    };
  },
});
