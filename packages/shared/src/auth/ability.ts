import {
  AbilityBuilder,
  createMongoAbility,
  type ForcedSubject,
  type MongoAbility,
} from '@casl/ability';
import type { PlatformRole } from '../domain/enums';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

export type SubjectName = 'User' | 'Tenant' | 'Membership' | 'Item' | 'all';

/**
 * Attributes each subject can be matched on. Keeping the shapes here is what
 * makes `can('read', 'Item', { tenantId })` type-check instead of silently
 * accepting any condition object.
 */
export interface SubjectShapes {
  User: { id: string; tenantId?: string };
  Tenant: { id: string };
  Membership: { id: string; tenantId: string; userId: string };
  Item: { id: string; tenantId: string; createdBy?: string | null };
  all: Record<string, unknown>;
}

export type AppSubject = {
  [K in SubjectName]: K | (SubjectShapes[K] & ForcedSubject<K>);
}[SubjectName];

export type AppAbility = MongoAbility<[Action, AppSubject]>;

export interface AuthContext {
  userId: string;
  platformRole: PlatformRole;
  tenantId?: string | undefined;
  membershipRole?: string | undefined;
}

/**
 * Pure, runtime-agnostic ability factory shared by backend, web and mobile
 * (doc 03 section 5.1).
 *
 * Accepts `null` on purpose: the frontend calls this before login, and that is
 * a normal state, not an error. Unknown membership roles fall through to the
 * least privilege so stale or future role values can never escalate.
 */
export function defineAbilityFor(ctx: AuthContext | null): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

  if (!ctx) return build();

  if (ctx.platformRole === 'ADMIN') {
    can('manage', 'all');
    return build();
  }

  if (!ctx.tenantId) return build();

  const inTenant = { tenantId: ctx.tenantId };

  switch (ctx.membershipRole) {
    case 'OWNER':
      can('manage', 'Item', inTenant);
      can('manage', 'Membership', inTenant);
      can(['read', 'update'], 'Tenant', { id: ctx.tenantId });
      can('read', 'User', inTenant);
      break;
    case 'EDITOR':
      can(['read', 'create', 'update'], 'Item', inTenant);
      can('read', 'Tenant', { id: ctx.tenantId });
      break;
    default:
      can('read', 'Item', inTenant);
      can('read', 'Tenant', { id: ctx.tenantId });
  }

  return build();
}
