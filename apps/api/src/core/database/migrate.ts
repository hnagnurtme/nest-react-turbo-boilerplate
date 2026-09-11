import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { getEnv } from '../../config';

/**
 * Resolves `apps/api/drizzle` whether this file runs from `src` (tsx, the
 * normal path) or from a compiled `dist` tree in a deploy image.
 */
function migrationsFolder(): string {
  const fromSource = resolve(__dirname, '../../../drizzle');
  return existsSync(fromSource) ? fromSource : resolve(process.cwd(), 'drizzle');
}

/**
 * Standalone migration runner — deliberately not a Nest provider, so a deploy
 * job can apply migrations without booting the application.
 *
 * It connects with DATABASE_MIGRATION_URL (the owner role). The app's own
 * DATABASE_URL has no DDL rights, which is what stops a running process from
 * altering the schema or dropping an RLS policy.
 */
async function main(): Promise<void> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_MIGRATION_URL, max: 1 });

  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsFolder() });
    console.warn('Migrations applied');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed', error);
  process.exit(1);
});
