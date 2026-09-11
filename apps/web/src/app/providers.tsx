import type { ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@repo/ui/primitives/toaster';
import { queryClient } from '@/lib/query/client';
import { AbilityProvider, useBootstrapAuth } from '@/features/auth';
import { ErrorBoundary } from '@/app/components/error-boundary';
import '@/lib/http/client'; // registers the fetcher with @repo/api-contract — import for side effect

function AuthGate({ children }: { children: ReactNode }) {
  const { isReady } = useBootstrapAuth();
  if (!isReady) return null; // avoid a login-page flash while the refresh cookie is checked
  return children;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthGate>
            <AbilityProvider>
              {children}
              <Toaster />
            </AbilityProvider>
          </AuthGate>
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
