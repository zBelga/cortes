'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, Loader2, XCircle } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { formatRelative } from '@/lib/utils';
import type { Page } from '@/types/api';

interface ExportItem {
  id: string;
  status: 'QUEUED' | 'RENDERING' | 'COMPLETED' | 'FAILED';
  progress: number;
  resolution: string;
  aspectRatio: string;
  createdAt: string;
  completedAt: string | null;
  clip: { id: string; title: string; thumbnailKey: string | null };
}

const ASPECT_LABEL: Record<string, string> = {
  VERTICAL_9_16: '9:16',
  SQUARE_1_1: '1:1',
  HORIZONTAL_16_9: '16:9',
};

export default function ExportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.exports.all,
    queryFn: () => api.get<Page<ExportItem>>('/exports?limit=40'),
    // Enquanto houver render em andamento, revalida a cada 5s.
    refetchInterval: (query) =>
      query.state.data?.items.some((e) => e.status === 'RENDERING' || e.status === 'QUEUED')
        ? 5_000
        : false,
  });

  const items = data?.items ?? [];

  return (
    <>
      <Topbar title="Exportações" />

      <main className="mx-auto max-w-4xl px-6 py-8">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-[68px] rounded-lg" />
            ))}
          </div>
        ) : items.length ? (
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-4 p-4 transition-colors hover:bg-surface-2">
                <StatusIcon status={item.status} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-fg">{item.clip.title}</p>
                  <p className="mt-0.5 text-xs text-fg-subtle">
                    {ASPECT_LABEL[item.aspectRatio] ?? item.aspectRatio} · {item.resolution} ·{' '}
                    {formatRelative(item.createdAt)}
                  </p>

                  {item.status === 'RENDERING' ? (
                    <Progress value={item.progress} className="mt-2 max-w-xs" />
                  ) : null}
                </div>

                {item.status === 'COMPLETED' ? (
                  <DownloadButton exportId={item.id} />
                ) : (
                  <Badge variant={item.status === 'FAILED' ? 'danger' : 'blue'}>
                    {item.status === 'FAILED' ? 'Falhou' : item.status === 'QUEUED' ? 'Na fila' : 'Renderizando'}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="panel">
            <EmptyState
              icon={<Download />}
              title="Nenhuma exportação ainda"
              description="Abra um projeto pronto, escolha um corte e exporte no formato da plataforma em que você publica."
            />
          </div>
        )}
      </main>
    </>
  );
}

/**
 * A URL assinada tem TTL curto e é pedida só no clique.
 * Gerar uma para cada linha da lista desperdiçaria assinaturas
 * que expirariam antes de o usuário sequer rolar até elas.
 */
function DownloadButton({ exportId }: { exportId: string }) {
  const [loading, setLoading] = React.useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const detail = await api.get<{ downloadUrl: string | null }>(`/exports/${exportId}`);
      if (detail.downloadUrl) window.location.assign(detail.downloadUrl);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" loading={loading} onClick={() => void download()}>
      <Download />
      Baixar
    </Button>
  );
}

function StatusIcon({ status }: { status: ExportItem['status'] }) {
  const className = 'size-4 shrink-0';
  if (status === 'COMPLETED') return <CheckCircle2 className={`${className} text-success`} />;
  if (status === 'FAILED') return <XCircle className={`${className} text-danger`} />;
  return <Loader2 className={`${className} animate-spin text-violet`} />;
}
