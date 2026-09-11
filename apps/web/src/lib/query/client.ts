import { QueryClient } from '@tanstack/react-query';
import { ProblemError } from '@/lib/http/problem-error';

/**
 * Defaults from doc 04 section 4: don't retry 4xx (retrying a 403 just adds
 * noise), keep the previous page visible while paginating, and let 5xx
 * bubble to the nearest ErrorBoundary instead of being handled ad hoc in
 * every component.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        if (error instanceof ProblemError && error.status < 500) return false;
        return failureCount < 2;
      },
      throwOnError: (error) => error instanceof ProblemError && error.status >= 500,
    },
    mutations: {
      retry: false,
    },
  },
});
