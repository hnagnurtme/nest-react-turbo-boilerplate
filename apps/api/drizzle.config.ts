import { defineConfig } from 'drizzle-kit';

// Migrations run as the owner role, never as the runtime role: app_runtime has
// no DDL rights on purpose (doc 02 section 2.1).
export default defineConfig({
  schema: './src/core/database/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL ?? '',
  },
  strict: true,
  verbose: true,
});
