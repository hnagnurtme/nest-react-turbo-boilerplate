// 1. The tracer MUST be imported before anything else (doc 02 section 5):
// auto-instrumentation patches `http`, `pg` and `ioredis` at require time, and
// a wrong import order produces empty traces with no error to tell you why.
import './core/telemetry/tracer';

import { RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { loadEnvFile, validateEnv } from './config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/filters/global-exception.filter';
import { TransformInterceptor } from './core/interceptors/transform.interceptor';
import { ZodValidationPipe } from './core/pipes/zod-validation.pipe';

loadEnvFile();

// 2. Fail fast, before spending time building the DI container.
const env = validateEnv(process.env);

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGINS,
    // Required for the httpOnly refresh cookie to travel at all.
    credentials: true,
    exposedHeaders: ['x-trace-id', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset'],
  });

  // Unprefixed and unversioned on purpose: an orchestrator health-checking
  // `/api/v1/healthz` is one version bump away from probing a route that no
  // longer exists (doc 06 section 2.1; see modules/health/health.controller.ts).
  app.setGlobalPrefix(env.API_PREFIX, {
    exclude: [
      { path: 'healthz', method: RequestMethod.GET },
      { path: 'readyz', method: RequestMethod.GET },
    ],
  });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  app.useGlobalPipes(new ZodValidationPipe());
  app.useGlobalFilters(app.get(GlobalExceptionFilter));
  app.useGlobalInterceptors(app.get(TransformInterceptor));

  // 3. Lets Nest drain the pg pool and flush spans on SIGTERM (doc 08).
  app.enableShutdownHooks();

  await app.listen(env.PORT);
}

void bootstrap();
