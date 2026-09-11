import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const IDEMPOTENCY_STATUSES = ['PROCESSING', 'COMPLETED'] as const;
export type IdempotencyStatus = (typeof IDEMPOTENCY_STATUSES)[number];

/**
 * Durable backing store for `Idempotency-Key` (doc 08 section 2). Redis holds
 * the hot path; this table survives a Redis flush.
 *
 * The key is unique per tenant, never globally: a global key space would let
 * one tenant guess or collide with another tenant's key.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull(),
    key: text('key').notNull(),
    /** Same key with a different body is a client bug, not a replay. */
    requestHash: text('request_hash').notNull(),
    status: text('status').$type<IdempotencyStatus>().notNull().default('PROCESSING'),
    responseStatus: integer('response_status'),
    responseBody: jsonb('response_body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('idempotency_keys_tenant_key_key').on(table.tenantId, table.key),
    index('idempotency_keys_expires_at_idx').on(table.expiresAt),
  ],
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
