import { useEffect, useState } from 'react';
import type { ApiResponse } from '@repo/shared';
import type { MeResponseDto } from '@repo/api-contract';
import { env } from '@/config/env';
import { useSessionStore } from '@/entities/session';
import { onAuthEvent } from '@/lib/http/broadcast';

/**
 * Runs once on app load. Access tokens live only in RAM (doc 03 section 2),
 * so a hard refresh loses them — this silently exchanges the httpOnly
 * refresh cookie for a new one via /auth/refresh, then loads /auth/me.
 * Failure just means "not logged in", never a crash.
 */
export function useBootstrapAuth(): { isReady: boolean } {
  const [isReady, setIsReady] = useState(false);
  const setSession = useSessionStore((s) => s.setSession);
  const clearSession = useSessionStore((s) => s.clearSession);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const refreshRes = await fetch(`${env.VITE_API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!refreshRes.ok) throw new Error('no session');
        const refreshBody = (await refreshRes.json()) as ApiResponse<{ accessToken: string }>;

        const meRes = await fetch(`${env.VITE_API_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${refreshBody.data.accessToken}` },
          credentials: 'include',
        });
        if (!meRes.ok) throw new Error('no session');
        const meBody = (await meRes.json()) as ApiResponse<MeResponseDto>;

        if (!cancelled) {
          setSession({
            accessToken: refreshBody.data.accessToken,
            user: meBody.data.user,
            memberships: meBody.data.memberships,
          });
        }
      } catch {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setIsReady(true);
      }
    }

    void bootstrap();
    const unsubscribe = onAuthEvent((event) => {
      if (event.type === 'logout') clearSession();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs exactly once, intentionally
  }, []);

  return { isReady };
}
