import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@repo/ui/primitives/button';
import { useSessionStore } from '@/entities/session';
import { useLogout } from '@repo/api-contract';

export function Layout({ children }: { children: ReactNode }) {
  const user = useSessionStore((s) => s.user);
  const clearSession = useSessionStore((s) => s.clearSession);
  const navigate = useNavigate();
  const logout = useLogout({
    onSettled: () => {
      clearSession();
      navigate('/login', { replace: true });
    },
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold">
            Boilerplate
          </Link>
          {user && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">{user.email}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
              >
                Sign out
              </Button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}
