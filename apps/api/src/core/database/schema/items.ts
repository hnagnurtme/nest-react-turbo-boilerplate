import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './tenants';
import { users } from './users';

export const ITEM_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/**
 * The framework's single reference slice: tenant-scoped, soft-deletable,
 * paginated, authorised. Copy it; do not build on it.
 */
export const items = pgTable(
  'items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    status: text('status').$type<ItemStatus>().notNull().default('DRAFT'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    index('items_tenant_id_idx').on(table.tenantId),
    index('items_tenant_created_at_idx').on(table.tenantId, table.createdAt),
  ],
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
