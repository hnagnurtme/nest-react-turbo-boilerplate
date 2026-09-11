import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfig } from '../../config';
import * as schema from './schema';

/** Injection token for the Drizzle instance. */
export const DATABASE = 'DATABASE';
/** Injection token for the raw pg pool (health checks, LISTEN/NOTIFY, shutdown). */
export const PG_POOL = 'PG_POOL';

export type AppSchema = typeof schema;
export type AppDatabase = NodePgDatabase<AppSchema>;

/**
 * `tx` as handed to a `db.transaction` callback. Derived from the database type
 * instead of importing Drizzle's internal generics, so it keeps working across
 * Drizzle versions.
 */
export type Tx = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Pool =>
        new Pool({
          // DATABASE_URL is the app_runtime role: DML only, NOBYPASSRLS.
          connectionString: config.database.url,
          max: config.database.poolMax,
          idleTimeoutMillis: 30_000,
          connectionTimeoutMillis: 5_000,
          application_name: config.telemetry.serviceName,
        }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): AppDatabase => drizzle(pool, { schema }),
    },
  ],
  exports: [DATABASE, PG_POOL],
})
export class DrizzleModule implements OnModuleDestroy {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Paired with `enableShutdownHooks()`: drain in-flight queries before exit. */
  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
