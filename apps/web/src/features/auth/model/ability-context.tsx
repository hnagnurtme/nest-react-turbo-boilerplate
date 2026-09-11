import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createContextualCan } from '@casl/react';
import { defineAbilityFor, type AppAbility } from '@repo/shared';
import { useSessionStore } from '@/entities/session';

export const AbilityContext = createContext<AppAbility>(defineAbilityFor(null));

/** `<Can I="update" a="Item" this={item}>...</Can>` — UI-only, never trust it alone (doc 03 section 5.3). */
export const Can = createContextualCan(AbilityContext.Consumer);

export function useAbility(): AppAbility {
  return useContext(AbilityContext);
}

export function AbilityProvider({ children }: { children: ReactNode }) {
  // Selecting the raw fields (not the derived authContext() call) keeps this
  // subscribed to actual state changes instead of re-running every render.
  const user = useSessionStore((s) => s.user);
  const activeTenantId = useSessionStore((s) => s.activeTenantId);
  const memberships = useSessionStore((s) => s.memberships);

  // useMemo is not optional here: without it every render creates a new
  // ability instance, and every <Can> consumer re-renders in a cascade
  // (doc 03 section 5.3).
  const ability = useMemo(() => {
    if (!user) return defineAbilityFor(null);
    const membership = memberships.find((m) => m.tenantId === activeTenantId);
    return defineAbilityFor({
      userId: user.id,
      platformRole: user.platformRole,
      tenantId: activeTenantId ?? undefined,
      membershipRole: membership?.role,
    });
  }, [user, activeTenantId, memberships]);

  return <AbilityContext.Provider value={ability}>{children}</AbilityContext.Provider>;
}
