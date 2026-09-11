import { Inject, Injectable, Logger } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { MissingTenantContextError } from '../errors';
import { DATABASE, type AppDatabase, type Tx } from './drizzle.module';
import { CLS_KEYS, TENANT_SETTING, type AppClsStore } from './tenant-context';

/**
 * The single gateway to the database (doc 02 section 2.2).
 *
 * Repositories never touch the connection directly: every query must run inside
 * a transaction that has already declared which tenant it belongs to, because
 * that declaration is what the RLS policies match on.
 */
@Injectable()
export class TransactionManager {
  private readonly logger = new Logger(TransactionManager.name);

  constructor(
    @Inject(DATABASE) private readonly db: AppDatabase,
    @Inject(ClsService) private readonly cls: ClsService<AppClsStore>,
  ) {}

  /** Runs `fn` in a transaction bound to the current request's tenant. */
  async runInTenantContext<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    const tenantId = this.cls.get(CLS_KEYS.tenantId);
    if (!tenantId) {
      // Fail-closed: without a tenant we refuse rather than query globally.
      throw new MissingTenantContextError();
    }

    return this.db.transaction(async (tx) => {
      // Third argument `true` = is_local: the setting is scoped to this
      // transaction and is discarded on COMMIT/ROLLBACK, so it can never leak
      // to the next request that reuses this pooled connection.
      await tx.execute(sql`SELECT set_config(${TENANT_SETTING}, ${tenantId}, true)`);
      return fn(tx);
    });
  }

  /**
   * Cross-tenant work (platform admin, cron, relays). `app.tenant_id` is left
   * unset, so RLS returns zero rows for app_runtime — a caller that needs to
   * see across tenants must also connect with a role permitted to.
   * `reason` is mandatory so the audit trail explains every use.
   */
  async runAsPlatform<T>(reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    this.logger.warn({ reason }, 'Executing cross-tenant operation');
    return this.db.transaction(fn);
  }

  /** Escape hatch for statements that must not be wrapped, e.g. health probes. */
  get raw(): AppDatabase {
    return this.db;
  }
}
