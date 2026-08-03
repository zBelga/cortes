'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Cpu, DollarSign, Layers, Users } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { StatCard } from '@/components/dashboard/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { formatDuration } from '@/lib/utils';

interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
}

interface Metrics {
  users: number;
  projects: { total: number; byStatus: Record<string, number> };
  clipsLast24h: number;
  exportsLast24h: number;
  failuresLast24h: number;
  aiCostLast24hCents: number;
  queues: Record<string, QueueCounts>;
  process: { rssMb: number; heapMb: number; uptimeSeconds: number };
}

interface StageTiming {
  key: string;
  label: string;
  samples: number;
  avgMs: number;
  maxMs: number;
}

export default function AdminPage() {
  const metrics = useQuery({
    queryKey: queryKeys.admin.metrics,
    queryFn: () => api.get<Metrics>('/admin/metrics'),
    refetchInterval: 15_000,
  });

  const timings = useQuery({
    queryKey: ['admin', 'stage-timings'],
    queryFn: () => api.get<StageTiming[]>('/admin/stage-timings'),
    staleTime: 5 * 60_000,
  });

  const data = metrics.data;
  const slowest = timings.data?.[0]?.avgMs ?? 1;

  return (
    <>
      <Topbar title="Painel admin" />

      <main className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-xl" />)
          ) : (
            <>
              <StatCard label="Usuários" value={data?.users ?? 0} icon={<Users />} accent="blue" />
              <StatCard
                label="Cortes (24h)"
                value={data?.clipsLast24h ?? 0}
                hint={`${data?.exportsLast24h ?? 0} exportações`}
                icon={<Layers />}
                accent="violet"
              />
              <StatCard
                label="Custo de IA (24h)"
                value={`US$ ${((data?.aiCostLast24hCents ?? 0) / 100).toFixed(2)}`}
                hint="soma dos providers"
                icon={<DollarSign />}
                accent="cyan"
              />
              <StatCard
                label="Falhas (24h)"
                value={data?.failuresLast24h ?? 0}
                hint="projetos encerrados com erro"
                icon={<AlertTriangle />}
                accent={data?.failuresLast24h ? 'violet' : 'success'}
              />
            </>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="size-4 text-violet" />
                Filas
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wider text-fg-subtle">
                      <th className="pb-2 text-left font-normal">Fila</th>
                      <th className="pb-2 text-right font-normal">Aguardando</th>
                      <th className="pb-2 text-right font-normal">Ativos</th>
                      <th className="pb-2 text-right font-normal">Falhas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {Object.entries(data.queues).map(([name, counts]) => (
                      <tr key={name}>
                        <td className="py-2 font-mono text-xs text-fg">{name}</td>
                        <td className="tabular py-2 text-right text-fg-muted">{counts.waiting}</td>
                        <td className="tabular py-2 text-right">
                          {counts.active ? (
                            <Badge variant="violet">{counts.active}</Badge>
                          ) : (
                            <span className="text-fg-subtle">0</span>
                          )}
                        </td>
                        <td className="tabular py-2 text-right">
                          <span className={counts.failed ? 'text-danger' : 'text-fg-subtle'}>
                            {counts.failed}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <Skeleton className="h-40" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="size-4 text-cyan" />
                Duração média por etapa (7 dias)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {timings.data?.length ? (
                timings.data.slice(0, 8).map((timing) => (
                  <div key={timing.key}>
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="text-fg-muted">{timing.label}</span>
                      <span className="tabular font-mono text-fg-subtle">
                        {formatDuration(timing.avgMs / 1000)}
                      </span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-violet to-cyan"
                        style={{ width: `${(timing.avgMs / slowest) * 100}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <p className="py-8 text-center text-sm text-fg-subtle">
                  Sem dados suficientes ainda.
                </p>
              )}
            </CardContent>
          </Card>
        </section>

        {data ? (
          <p className="font-mono text-2xs text-fg-subtle">
            RSS {data.process.rssMb} MB · heap {data.process.heapMb} MB · uptime{' '}
            {formatDuration(data.process.uptimeSeconds)}
          </p>
        ) : null}
      </main>
    </>
  );
}
