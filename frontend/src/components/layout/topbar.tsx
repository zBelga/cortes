'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Coins, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useCommandMenu } from './command-menu';

export function Topbar({ title }: { title?: string }) {
  const { open } = useCommandMenu();

  const balance = useQuery({
    queryKey: queryKeys.billing.balance,
    queryFn: () => api.get<{ balance: number; plan: string }>('/billing/balance'),
    staleTime: 60_000,
  });

  return (
    <header className="glass sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border px-5">
      {title ? <h1 className="text-sm font-medium text-fg">{title}</h1> : null}

      <button
        onClick={open}
        className="group ml-auto flex h-8 items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 text-xs text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted sm:w-64"
      >
        <Search className="size-3.5" />
        <span className="hidden sm:inline">Buscar…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-fg-subtle sm:inline">
          ⌘K
        </kbd>
      </button>

      {balance.isLoading ? (
        <Skeleton className="h-6 w-20 rounded-full" />
      ) : (
        <Badge variant={((balance.data?.balance ?? 0) < 5 ? 'warn' : 'violet')}>
          <Coins className="size-3" />
          <span className="tabular">{balance.data?.balance ?? 0}</span>
        </Badge>
      )}

      <Button asChild variant="primary" size="sm">
        <Link href="/projects/new">
          <Plus />
          <span className="hidden sm:inline">Novo projeto</span>
        </Link>
      </Button>
    </header>
  );
}
