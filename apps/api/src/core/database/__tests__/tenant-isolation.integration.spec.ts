import { resolve } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { ClsService } from 'nestjs-cls';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MissingTenantContextError } from '../../errors';
import type { AppDatabase } from '../drizzle.module';
import * as schema from '../schema';
import { items, tenants } from '../schema';
import { CLS_KEYS, type AppClsStore } from '../tenant-context';
import { TransactionManager } from '../transaction.manager';

/**
 * The load-bearing test suite of the whole framework (doc 09 section 2).
 * "Zero-leakage multi-tenancy" is a promise this file either proves or the
 * promise is false — nothing here is optional or safe to skip.
 *
 * It runs against a REAL Postgres with REAL RLS policies. A version of this
 * suite that mocks Drizzle would prove only that the mock was called
 * correctly, never that a cross-tenant read is actually impossible.
 */
describe('tenant isolation (RLS)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let ownerDb: AppDatabase;
  let runtimePool: Pool;
  let runtimeDb: AppDatabase;

  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    // The container's bootstrap user is a real Postgres superuser, exactly
    // like `app_owner` in production — migrations run as it, and being a
    // superuser it always bypasses RLS regardless of FORCE, which is what
    // lets seeding below insert rows for two different tenants freely.
    container = await new PostgreSqlContainer('postgres:16-alpine').start();

    ownerPool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: container.getUsername(),
      password: container.getPassword(),
    });
    ownerDb = drizzle(ownerPool, { schema });

    // Same migration folder `pnpm db:migrate` uses in every other
    // environment — this is not a parallel/simplified schema.
    await migrate(ownerDb, { migrationsFolder: resolve(__dirname, '../../../../drizzle') });

    // 0000_init.sql creates `app_runtime` (NOBYPASSRLS) itself when absent,
    // so this ephemeral database is self-sufficient without
    // infra/postgres/init running first.
    runtimePool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: 'app_runtime',
      password: 'app_runtime',
    });
    runtimeDb = drizzle(runtimePool, { schema });
  }, 120_000);

  afterAll(async () => {
    await ownerPool?.end();
    await runtimePool?.end();
    await container?.stop();
  });

  beforeEach(async () => {
    // Superuser writes bypass RLS entirely, so this is a clean, direct seed —
    // not something that could accidentally pass because of the isolation
    // we are trying to prove.
    await ownerDb.delete(items);
    await ownerDb.delete(tenants);

    const [a] = await ownerDb.insert(tenants).values({ name: 'Tenant A', slug: 'tenant-a' }).returning();
    const [b] = await ownerDb.insert(tenants).values({ name: 'Tenant B', slug: 'tenant-b' }).returning();
    if (!a || !b) throw new Error('seed failed');
    tenantA = a.id;
    tenantB = b.id;

    await ownerDb.insert(items).values([
      { tenantId: tenantA, title: 'Item A' },
      { tenantId: tenantB, title: 'Item B' },
    ]);
  });

  /** Fakes just enough of ClsService for TransactionManager's one `.get()` call. */
  function clsWithTenant(tenantId?: string): ClsService<AppClsStore> {
    return {
      get: (key: string) => (key === CLS_KEYS.tenantId ? tenantId : undefined),
    } as unknown as ClsService<AppClsStore>;
  }

  it('never returns another tenant even when the query has no WHERE tenant_id', async () => {
    const txManager = new TransactionManager(runtimeDb, clsWithTenant(tenantA));

    // Deliberately the naive query a developer would write if they forgot
    // the tenant filter entirely — this must still come back scoped to A.
    const rows = await txManager.runInTenantContext((tx) => tx.select().from(items));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe('Item A');
  });

  it('rejects inserting a row tagged with a different tenant', async () => {
    const txManager = new TransactionManager(runtimeDb, clsWithTenant(tenantA));

    await expect(
      txManager.runInTenantContext((tx) =>
        tx.insert(items).values({ tenantId: tenantB, title: 'Smuggled row' }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('does not leak tenant context across transactions sharing one pooled connection', async () => {
    // A single-connection pool forces both transactions below onto the exact
    // same physical connection, which is precisely the scenario
    // set_config(..., true) (is_local) exists to make safe.
    const singleConnPool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: 'app_runtime',
      password: 'app_runtime',
      max: 1,
    });
    const singleConnDb = drizzle(singleConnPool, { schema });

    try {
      const txManager = new TransactionManager(singleConnDb, clsWithTenant(tenantA));
      const rowsA = await txManager.runInTenantContext((tx) => tx.select().from(items));
      expect(rowsA.map((r) => r.title)).toEqual(['Item A']);

      const txManagerB = new TransactionManager(singleConnDb, clsWithTenant(tenantB));
      const rowsB = await txManagerB.runInTenantContext((tx) => tx.select().from(items));
      expect(rowsB.map((r) => r.title)).toEqual(['Item B']); // NOT A's row
    } finally {
      await singleConnPool.end();
    }
  });

  it('fails closed — refuses to run rather than query without a tenant', async () => {
    const txManager = new TransactionManager(runtimeDb, clsWithTenant(undefined));

    await expect(txManager.runInTenantContext((tx) => tx.select().from(items))).rejects.toThrow(
      MissingTenantContextError,
    );
  });

  it('a query issued with no app.tenant_id set at all returns zero rows, never all rows', async () => {
    // Bypasses TransactionManager on purpose to prove the DATABASE-level
    // guarantee, not just the application-level guard above.
    const rows = await runtimeDb.select().from(items);
    expect(rows).toHaveLength(0);
  });

  it('the runtime role can never bypass row level security', async () => {
    // node-postgres' `execute()` returns a QueryResult, not an array — the
    // rows live under `.rows` (doc 09 section 2 test bank).
    const result = await runtimeDb.execute<{ rolbypassrls: boolean }>(
      sql`SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user`,
    );
    expect(result.rows[0]?.rolbypassrls).toBe(false);
  });

  it('every table carrying tenant_id has RLS enabled and forced', async () => {
    const result = await ownerDb.execute<{ relname: string }>(sql`
      SELECT c.relname
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'tenant_id'
      WHERE c.relkind = 'r'
        AND c.relnamespace = 'public'::regnamespace
        AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
    `);
    expect(result.rows).toEqual([]);
  });
});
