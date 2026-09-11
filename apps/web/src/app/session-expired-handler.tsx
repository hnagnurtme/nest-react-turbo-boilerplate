import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSessionStore } from '@/entities/session';
import { setOnSessionExpired } from '@/lib/http/client';

/**
 * Wires the HTTP client's "refresh failed" callback to actual identity
 * clearing + navigation. Lives at the `app` layer, the only one allowed to
 * import both `lib` and `entities` (doc 01 section 2.2) — the client itself
 * stays framework- and identity-agnostic.
 */
export function SessionExpiredHandler() {
  const navigate = useNavigate();
  const clearSession = useSessionStore((s) => s.clearSession);

  useEffect(() => {
    setOnSessionExpired(() => {
      clearSession();
      navigate('/login', { replace: true });
    });
    return () => setOnSessionExpired(() => {});
  }, [navigate, clearSession]);

  return null;
}
