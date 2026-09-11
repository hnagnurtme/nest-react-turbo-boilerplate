/**
 * Platform-wide role. Deliberately tiny: roles that differ per project belong
 * to `memberships.role`, not here (doc 03 section 1).
 */
export const PLATFORM_ROLES = ['ADMIN', 'MEMBER'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/**
 * Default tenant membership roles. Projects are free to use other strings;
 * `defineAbilityFor` falls back to the least privilege for unknown values.
 */
export const MEMBERSHIP_ROLES = ['OWNER', 'EDITOR', 'VIEWER'] as const;
export type MembershipRole = (typeof MEMBERSHIP_ROLES)[number];

export const MEMBERSHIP_STATUSES = ['ACTIVE', 'INVITED', 'SUSPENDED'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export const CLIENT_TYPES = ['web', 'mobile'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
