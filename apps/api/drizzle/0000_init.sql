-- Initial schema. Hand-written so the RLS policies live in the same migration
-- as the tables they protect: a table can never exist without its policy.

-- The runtime role normally comes from infra/postgres/init/01-roles.sql. Created
-- here too so an ephemeral test database (testcontainers) is self-sufficient.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime LOGIN PASSWORD 'app_runtime' NOBYPASSRLS;
    GRANT USAGE ON SCHEMA public TO app_runtime;
  END IF;
END
$$;
--> statement-breakpoint

CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants" ("slug");
--> statement-breakpoint

CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"display_name" text,
	"platform_role" text DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" ("email");
--> statement-breakpoint

CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"role" text DEFAULT 'VIEWER' NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "memberships_user_tenant_key" ON "memberships" ("user_id","tenant_id");
--> statement-breakpoint
CREATE INDEX "memberships_tenant_id_idx" ON "memberships" ("tenant_id");
--> statement-breakpoint

CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"family_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"user_agent" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens" ("token_hash");
--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" ("family_id");
--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" ("user_id");
--> statement-breakpoint

CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"created_by" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "items_tenant_id_idx" ON "items" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "items_tenant_created_at_idx" ON "items" ("tenant_id","created_at");
--> statement-breakpoint

CREATE TABLE "audit_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tenant_id" uuid,
	"actor_id" uuid,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text,
	"changes" jsonb,
	"ip" text,
	"user_agent" text,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_created_at_idx" ON "audit_logs" ("tenant_id","created_at");
--> statement-breakpoint
CREATE INDEX "audit_logs_resource_idx" ON "audit_logs" ("resource_type","resource_id");
--> statement-breakpoint

CREATE TABLE "outbox_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"trace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" ("aggregate_type","aggregate_id");
--> statement-breakpoint
-- Partial index: the relay only ever scans unpublished rows.
CREATE INDEX "outbox_events_unpublished_idx" ON "outbox_events" ("created_at") WHERE "published_at" IS NULL;
--> statement-breakpoint

CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" text DEFAULT 'PROCESSING' NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_tenant_key_key" ON "idempotency_keys" ("tenant_id","key");
--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" ("expires_at");
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Row Level Security (doc 02 section 2.3)
--
-- Every table carrying tenant_id gets the same three things:
--   ENABLE  - turn policies on
--   FORCE   - apply them to the table owner too, not just other roles
--   policy  - USING and WITH CHECK, so reads AND writes are both constrained
--
-- NULLIF(current_setting('app.tenant_id', true), '') matters: an unset variable
-- reads back as '', and ''::uuid raises instead of returning nothing. NULLIF
-- turns it into NULL, and `tenant_id = NULL` is never true - fail-closed.
-- ---------------------------------------------------------------------------

ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- A user's own membership list is, by definition, a cross-tenant read (they
-- do not yet know which tenant to scope to) -- the second USING clause lets
-- a request bound only to app.user_id (TransactionManager.runAsUser, used by
-- auth's login/me/switch-tenant) see its own rows without granting it every
-- other tenant's. WITH CHECK stays tenant-only: nothing should ever INSERT
-- or UPDATE a membership outside a real tenant context.
CREATE POLICY "tenant_isolation" ON "memberships"
	FOR ALL
	TO app_runtime
	USING (
		tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid
		OR user_id = NULLIF(current_setting('app.user_id', true), '')::uuid
	)
	WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "items" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "items"
	FOR ALL
	TO app_runtime
	USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
	WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "audit_logs"
	FOR ALL
	TO app_runtime
	USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
	WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "outbox_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "outbox_events" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "outbox_events"
	FOR ALL
	TO app_runtime
	USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
	WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

ALTER TABLE "idempotency_keys" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "idempotency_keys" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "idempotency_keys"
	FOR ALL
	TO app_runtime
	USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
	WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Privileges for the runtime role. DDL is deliberately absent.
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON
	"tenants", "users", "memberships", "refresh_tokens", "items",
	"audit_logs", "outbox_events", "idempotency_keys"
	TO app_runtime;
--> statement-breakpoint
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
--> statement-breakpoint

-- Append-only audit trail (doc 08 section 4): a log the application can rewrite
-- is not evidence of anything.
REVOKE UPDATE, DELETE ON "audit_logs" FROM app_runtime;
