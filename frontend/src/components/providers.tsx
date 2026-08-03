'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ApiError } from '@/lib/api';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // 30 s de "fresco": navegar entre telas não refaz requisição.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Erro do cliente (4xx) não melhora com repetição.
          if (error instanceof ApiError && error.status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: { retry: false },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  // No servidor, um cliente por request; no browser, um singleton —
  // recriar no browser descartaria todo o cache a cada render do provider.
  if (typeof window === 'undefined') return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250} skipDelayDuration={0}>
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            className: 'glass border border-border text-fg',
            duration: 4000,
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
