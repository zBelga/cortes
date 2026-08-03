'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Ponto de integração com Sentry — ver docs/10-todo.md.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-xl border border-danger/25 bg-danger/10 text-danger">
        <AlertTriangle className="size-5" />
      </span>
      <h1 className="mt-5 text-xl font-medium tracking-tight">Algo deu errado</h1>
      <p className="mt-2 max-w-sm text-sm text-fg-muted">
        Encontramos um erro inesperado nesta tela. Você pode tentar de novo — se persistir, nos avise.
      </p>
      {error.digest ? (
        <code className="mt-3 rounded border border-border bg-surface-2 px-2 py-1 font-mono text-2xs text-fg-subtle">
          {error.digest}
        </code>
      ) : null}
      <Button variant="primary" className="mt-6" onClick={reset}>
        <RefreshCw />
        Tentar novamente
      </Button>
    </main>
  );
}
