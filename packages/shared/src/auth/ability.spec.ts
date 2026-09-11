import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import { defineAbilityFor } from './ability';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';

const itemIn = (tenantId: string) => subject('Item', { id: 'i1', tenantId });

describe('defineAbilityFor', () => {
  it('returns an empty ability for a guest instead of throwing', () => {
    const ability = defineAbilityFor(null);
    expect(ability.can('read', 'Item')).toBe(false);
  });

  it('grants platform admins everything', () => {
    const ability = defineAbilityFor({ userId: 'u1', platformRole: 'ADMIN' });
    expect(ability.can('manage', 'all')).toBe(true);
  });

  it('grants nothing to a logged-in user with no tenant selected', () => {
    const ability = defineAbilityFor({ userId: 'u1', platformRole: 'MEMBER' });
    expect(ability.can('read', 'Item')).toBe(false);
  });

  it('scopes an owner to their own tenant', () => {
    const ability = defineAbilityFor({
      userId: 'u1',
      platformRole: 'MEMBER',
      tenantId: TENANT_A,
      membershipRole: 'OWNER',
    });
    expect(ability.can('delete', itemIn(TENANT_A))).toBe(true);
    expect(ability.can('delete', itemIn(TENANT_B))).toBe(false);
  });

  it('denies an editor the right to delete', () => {
    const ability = defineAbilityFor({
      userId: 'u1',
      platformRole: 'MEMBER',
      tenantId: TENANT_A,
      membershipRole: 'EDITOR',
    });
    expect(ability.can('update', itemIn(TENANT_A))).toBe(true);
    expect(ability.can('delete', itemIn(TENANT_A))).toBe(false);
  });

  it('falls back to least privilege for an unknown role', () => {
    const ability = defineAbilityFor({
      userId: 'u1',
      platformRole: 'MEMBER',
      tenantId: TENANT_A,
      membershipRole: 'SOME_ROLE_FROM_THE_FUTURE',
    });
    expect(ability.can('read', itemIn(TENANT_A))).toBe(true);
    expect(ability.can('update', itemIn(TENANT_A))).toBe(false);
  });
});
