'use client';

import { useQuery } from '@tanstack/react-query';
import { Coins, KeyRound, Webhook } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { formatRelative } from '@/lib/utils';

interface LedgerEntry {
  id: string;
  kind: string;
  amount: number;
  description: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = {
  GRANT: 'Bônus',
  RESERVE: 'Reserva',
  COMMIT: 'Consumo',
  RELEASE: 'Estorno',
  PURCHASE: 'Compra',
  REFUND: 'Reembolso',
};

export default function SettingsPage() {
  const balance = useQuery({
    queryKey: queryKeys.billing.balance,
    queryFn: () => api.get<{ balance: number; plan: string }>('/billing/balance'),
  });

  const history = useQuery({
    queryKey: queryKeys.billing.history,
    queryFn: () => api.get<LedgerEntry[]>('/billing/history'),
  });

  return (
    <>
      <Topbar title="Configurações" />

      <main className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="size-4 text-violet" />
              Créditos
            </CardTitle>
            <CardDescription>1 crédito equivale a 1 minuto de vídeo processado.</CardDescription>
          </CardHeader>
          <CardContent>
            {balance.isLoading ? (
              <Skeleton className="h-10 w-32" />
            ) : (
              <div className="flex items-baseline gap-3">
                <span className="tabular text-3xl font-medium tracking-tight">
                  {balance.data?.balance ?? 0}
                </span>
                <Badge variant="violet">{balance.data?.plan}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Histórico</CardTitle>
            <CardDescription>
              Reservas são estornadas automaticamente quando um processamento falha.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {history.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            ) : history.data?.length ? (
              <ul className="divide-y divide-border">
                {history.data.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">
                        {entry.description ?? KIND_LABEL[entry.kind] ?? entry.kind}
                      </p>
                      <p className="text-2xs text-fg-subtle">{formatRelative(entry.createdAt)}</p>
                    </div>
                    <span
                      className={`tabular font-mono text-sm ${
                        entry.amount > 0 ? 'text-success' : entry.amount < 0 ? 'text-fg-muted' : 'text-fg-subtle'
                      }`}
                    >
                      {entry.amount > 0 ? '+' : ''}
                      {entry.amount}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-6 text-center text-sm text-fg-subtle">Nenhuma movimentação ainda.</p>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-fg-subtle" />
                API pública
              </CardTitle>
              <CardDescription>
                Chaves de acesso programático com escopos por recurso. Disponível na fase 4.
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="size-4 text-fg-subtle" />
                Webhooks
              </CardTitle>
              <CardDescription>
                Receba eventos de projeto e exportação assinados com HMAC-SHA256.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </main>
    </>
  );
}
