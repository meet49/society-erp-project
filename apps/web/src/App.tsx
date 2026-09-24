import { useEffect, useMemo } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { Toaster } from 'sonner';
import { queryClient } from '@/lib/query-client';
import { buildRouter } from '@/app/router';
import { bootstrapSession } from '@/hooks/use-auth';
import { useUiStore } from '@/stores/ui.store';
import '@/features/registry';

export default function App() {
  const router = useMemo(() => buildRouter(), []);
  const theme = useUiStore((s) => s.theme);
  useEffect(() => {
    void bootstrapSession();
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster richColors closeButton position="top-right" theme={theme === 'system' ? 'system' : theme} />
    </QueryClientProvider>
  );
}
