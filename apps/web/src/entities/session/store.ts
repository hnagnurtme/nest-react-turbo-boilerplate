import { create } from 'zustand';
import type { AuthContext } from '@repo/shared';
import type { MembershipDto, TenantDto, UserDto } from '@repo/api-contract';
import { useTokenStore } from '@/lib/auth/token-store';

/**
 * Identity and membership data, one layer above the raw tokens (doc 01
 * section 2.2: entities may import lib, features may import entities).
 * `app/components` reads `user` from here; `lib/http` never does — it only
 * ever touches `lib/auth/token-store`.
 */
interface SessionState {
  user: UserDto | null;
  memberships: (MembershipDto & { tenant?: TenantDto })[];
  activeTenantId: string | null;
  setSession: (input: {
    accessToken: string;
    csrfToken: string;
    user: UserDto;
    memberships?: (MembershipDto & { tenant?: TenantDto })[];
  }) => void;
  setActiveTenant: (tenantId: string) => void;
  clearSession: () => void;
  authContext: () => AuthContext | null;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  user: null,
  memberships: [],
  activeTenantId: null,

  setSession: ({ accessToken, csrfToken, user, memberships }) => {
    useTokenStore.getState().setTokens({ accessToken, csrfToken });
    set((state) => {
      const nextMemberships = memberships ?? state.memberships;
      return {
        user,
        memberships: nextMemberships,
        activeTenantId: state.activeTenantId ?? nextMemberships[0]?.tenantId ?? null,
      };
    });
  },

  setActiveTenant: (activeTenantId) => set({ activeTenantId }),

  clearSession: () => {
    useTokenStore.getState().clearTokens();
    set({ user: null, memberships: [], activeTenantId: null });
  },

  authContext: () => {
    const { user, activeTenantId, memberships } = get();
    if (!user) return null;
    const membership = memberships.find((m) => m.tenantId === activeTenantId);
    return {
      userId: user.id,
      platformRole: user.platformRole,
      tenantId: activeTenantId ?? undefined,
      membershipRole: membership?.role,
    };
  },
}));
