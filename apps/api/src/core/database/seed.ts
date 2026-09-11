import argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { getEnv } from '../../config';
import * as schema from './schema';

/**
 * Minimal development seed: one tenant, one owner, one item.
 *
 * It connects with DATABASE_MIGRATION_URL because the runtime role cannot see
 * rows without `app.tenant_id`, and the tenant does not exist yet at this point.
 */
async function main(): Promise<void> {
  const env = getEnv();
  const pool = new Pool({ connectionString: env.DATABASE_MIGRATION_URL, max: 1 });
  const db = drizzle(pool, { schema });

  try {
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: 'Acme', slug: 'acme' })
      .onConflictDoNothing()
      .returning();

    if (!tenant) {
      console.warn('Seed skipped: tenant "acme" already exists');
      return;
    }

    const [user] = await db
      .insert(schema.users)
      .values({
        email: 'owner@example.com',
        passwordHash: await argon2.hash('password123', {
          type: argon2.argon2id,
          memoryCost: env.ARGON2_MEMORY_COST,
          timeCost: 2,
        }),
        displayName: 'Acme Owner',
        platformRole: 'ADMIN',
      })
      .returning();

    if (!user) throw new Error('Failed to create the seed user');

    await db
      .insert(schema.memberships)
      .values({ userId: user.id, tenantId: tenant.id, role: 'OWNER', status: 'ACTIVE' });

    await db
      .insert(schema.items)
      .values({ tenantId: tenant.id, title: 'First item', createdBy: user.id });

    console.warn(`Seeded tenant ${tenant.slug} with owner ${user.email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed', error);
  process.exit(1);
});
