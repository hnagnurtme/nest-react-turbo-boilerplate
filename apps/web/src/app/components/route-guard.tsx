import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useSessionStore } from '@/entities/session';

/**
 * Hiding a route (or a button, doc 03 section 5.3) is UX, never security —
 * the backend re-checks everything through PoliciesGuard + RLS regardless.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const user = useSessionStore((s) => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
