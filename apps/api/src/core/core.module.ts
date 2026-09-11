import {
  Global,
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import { ClsMiddleware, ClsModule } from 'nestjs-cls';
import { AppConfig } from '../config';
import { DrizzleModule } from './database/drizzle.module';
import { CLS_KEYS } from './database/tenant-context';
import { TransactionManager } from './database/transaction.manager';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { TransformInterceptor } from './interceptors/transform.interceptor';
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
          // correlates; the auth guard adds tenantId/userId once verified.
          cls.set(CLS_KEYS.traceId, trace.getActiveSpan()?.spanContext().traceId);
        },
      },
    }),
    AppLoggerModule,
    DrizzleModule,
  ],
  providers: [AppConfig, TransactionManager, GlobalExceptionFilter, TransformInterceptor],
  exports: [
    AppConfig,
    TransactionManager,
    GlobalExceptionFilter,
    TransformInterceptor,
    DrizzleModule,
    AppLoggerModule,
    ClsModule,
  ],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ClsMiddleware).forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
}
