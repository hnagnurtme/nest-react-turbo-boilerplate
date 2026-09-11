import {
  Global,
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { trace } from '@opentelemetry/api';
import { ClsMiddleware, ClsModule } from 'nestjs-cls';
import { AppConfig } from '../config';
import { TokenService } from './auth/token.service';
import { DrizzleModule } from './database/drizzle.module';
import { CLS_KEYS } from './database/tenant-context';
import { TransactionManager } from './database/transaction.manager';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { JwtAuthGuard, PoliciesGuard } from './guards';
import { TransformInterceptor } from './interceptors/transform.interceptor';
import { CsrfMiddleware } from './middleware/csrf.middleware';
import { AppLoggerModule } from './logger/logger.module';

/**
 * Technical infrastructure, loaded exactly once. Global so feature modules can
 * inject `TransactionManager` without re-importing plumbing, which is also what
 * keeps them from reaching for a raw connection.
 */
@Global()
@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        // Mounted by hand below: the built-in mount uses the Express 4 wildcard
        // syntax, which Express 5 warns about on every boot.
        mount: false,
        setup: (cls) => {
          // Seeded here so the very first log line of a request already
          // correlates; JwtAuthGuard adds tenantId/userId once verified.
          cls.set(CLS_KEYS.traceId, trace.getActiveSpan()?.spanContext().traceId);
        },
      },
    }),
    AppLoggerModule,
    DrizzleModule,
    // No default secret: TokenService always passes one explicitly per call,
    // since access and refresh tokens use different secrets (doc 03 section
    // 4 — a shared secret would let a refresh token be replayed as an
    // access token).
    JwtModule.register({}),
  ],
  providers: [
    AppConfig,
    TransactionManager,
    GlobalExceptionFilter,
    TransformInterceptor,
    TokenService,
    PoliciesGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
  exports: [
    AppConfig,
    TransactionManager,
    GlobalExceptionFilter,
    TransformInterceptor,
    TokenService,
    PoliciesGuard,
    DrizzleModule,
    AppLoggerModule,
    ClsModule,
  ],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ClsMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
    consumer.apply(CsrfMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
