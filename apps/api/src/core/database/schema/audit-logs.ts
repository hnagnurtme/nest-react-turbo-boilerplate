import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Append-only (doc 08 section 4). The migration revokes UPDATE and DELETE from
 * app_runtime: an audit log the application can rewrite is not an audit log.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    tenantId: uuid('tenant_id'),
    actorId: uuid('actor_id'),
    actorType: text('actor_type').$type<'user' | 'system' | 'api_key'>().notNull(),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    changes: jsonb('changes').$type<Record<string, { before: unknown; after: unknown }>>(),
    ip: text('ip'),
    userAgent: text('user_agent'),
    traceId: text('trace_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_tenant_created_at_idx').on(table.tenantId, table.createdAt),
    index('audit_logs_resource_idx').on(table.resourceType, table.resourceId),
  ],
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
