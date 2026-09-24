import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toApiError } from '@/lib/api-client';
import { handleApiError } from '@/lib/errors';

/** Server state lives here. Global error handling maps API codes to toasts unless a call opts out with meta.silent. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, err) => {
        const e = toApiError(err);
        return (e.status >= 500 || e.status === 0) && e.code !== 'CANCELLED' && count < 2;
      },
    },
    mutations: { retry: 0 },
  },
  queryCache: new QueryCache({
    onError: (err, query) => {
      if (query.meta?.silent) return;
      const e = toApiError(err);
      // 4xx on background reads are surfaced by the page (ErrorState); only toast unexpected failures
      if (e.status >= 500 || e.status === 0) handleApiError(e);
    },
  }),
  mutationCache: new MutationCache({
    onError: (err, _vars, _ctx, mutation) => {
      if (mutation.meta?.silent) return;
      handleApiError(err);
    },
  }),
});

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { silent?: boolean };
    mutationMeta: { silent?: boolean };
  }
}
