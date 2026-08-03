'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { AlertCircle, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { PipelineStepper } from '@/components/processing/pipeline-stepper';
import { ProgressRing } from '@/components/processing/progress-ring';
import { ViralTimeline } from '@/components/timeline/viral-timeline';
import { ClipGrid } from '@/components/clips/clip-grid';
import { ClipPlayer } from '@/components/player/clip-player';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Reveal } from '@/components/motion/reveal';
import { usePipeline } from '@/hooks/use-pipeline';
import { useProject, useRetryProject } from '@/hooks/use-projects';
import { useClips, useTimeline, type ClipFilters } from '@/hooks/use-clips';
import { formatDuration } from '@/lib/utils';
import type { Clip } from '@/types/api';

const TOP_FILTERS = [
  { value: '0', label: 'Todos' },
  { value: '5', label: 'Top 5' },
  { value: '10', label: 'Top 10' },
  { value: '20', label: 'Top 20' },
] as const;

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();

  const project = useProject(id);
  const pipeline = usePipeline(id, project.data?.status !== 'READY');
  const isReady = project.data?.status === 'READY';
  const isFailed = project.data?.status === 'FAILED';

  if (project.isLoading) return <ProjectSkeleton />;

  return (
    <>
      <Topbar title={project.data?.title ?? 'Projeto'} />

      <main className="mx-auto max-w-7xl px-6 py-8">
        {isFailed ? (
          <FailureBanner
            projectId={id}
            hint={project.data?.failureHint ?? 'Não conseguimos processar este vídeo.'}
          />
        ) : null}

        {!isReady && !isFailed ? (
          <ProcessingView
            stages={pipeline.state?.stages ?? []}
            progress={pipeline.progress}
            etaSeconds={pipeline.etaSeconds}
            currentStage={pipeline.currentStage}
            message={pipeline.message}
            connected={pipeline.connected}
            startedAt={pipeline.state?.startedAt ?? null}
          />
        ) : null}

        {isReady ? <ResultsView projectId={id} /> : null}
      </main>
    </>
  );
}

// ── processamento ────────────────────────────────────────────────────────────

interface ProcessingViewProps {
  stages: React.ComponentProps<typeof PipelineStepper>['stages'];
  progress: number;
  etaSeconds: number | null;
  currentStage: string | null;
  message: string | null;
  connected: boolean;
  startedAt: string | null;
}

function ProcessingView({
  stages,
  progress,
  etaSeconds,
  currentStage,
  message,
  connected,
  startedAt,
}: ProcessingViewProps) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!startedAt) return;
    const base = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, (Date.now() - base) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [startedAt]);

  return (
    <Reveal>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
        <div className="panel flex flex-col items-center justify-center p-8">
          <ProgressRing progress={progress} etaSeconds={etaSeconds} elapsedSeconds={elapsed} />

          <Badge variant={connected ? 'success' : 'warn'} className="mt-6">
            {connected ? <Wifi className="size-3" /> : <WifiOff className="size-3" />}
            {connected ? 'Ao vivo' : 'Reconectando…'}
          </Badge>
        </div>

        <div className="panel p-6">
          <h2 className="mb-5 text-sm font-medium text-fg">Etapas do processamento</h2>
          {stages.length ? (
            <PipelineStepper stages={stages} currentStage={currentStage} message={message} />
          ) : (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-5 w-full" />
              ))}
            </div>
          )}
        </div>
      </div>
    </Reveal>
  );
}

// ── resultados ───────────────────────────────────────────────────────────────

function ResultsView({ projectId }: { projectId: string }) {
  const [topFilter, setTopFilter] = React.useState<string>('0');
  const [playing, setPlaying] = React.useState<Clip | null>(null);
  const [seekMs, setSeekMs] = React.useState(0);

  const timeline = useTimeline(projectId);
  // A timeline usa a ordem cronológica; a grade usa o ranking.
  const timelineClips = useClips(projectId, { sort: 'timeline' });

  const filters = React.useMemo<ClipFilters>(() => ({ sort: 'top' }), []);
  const clipsForTimeline = React.useMemo(
    () => timelineClips.data?.pages.flatMap((page) => page.items) ?? [],
    [timelineClips.data],
  );

  const limit = Number(topFilter);
  const gridClips = React.useMemo(
    () => (limit ? clipsForTimeline.slice(0, limit) : null),
    [clipsForTimeline, limit],
  );

  const durationMs = React.useMemo(() => {
    const points = timeline.data ?? [];
    return points.length ? points[points.length - 1]!.timeMs + 1000 : 0;
  }, [timeline.data]);

  const handlePlay = React.useCallback((clip: Clip) => setPlaying(clip), []);

  const playingIndex = playing ? clipsForTimeline.findIndex((c) => c.id === playing.id) : -1;

  return (
    <div className="space-y-8">
      {timeline.data?.length ? (
        <Reveal>
          <section className="panel p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-medium text-fg">Linha do tempo de viralização</h2>
                <p className="mt-0.5 text-xs text-fg-subtle">
                  Clique em qualquer ponto para pular direto ao trecho
                </p>
              </div>
              <span className="tabular font-mono text-2xs text-fg-subtle">
                {formatDuration(durationMs / 1000)}
              </span>
            </div>

            <ViralTimeline
              points={timeline.data}
              clips={clipsForTimeline}
              durationMs={durationMs}
              currentMs={seekMs}
              onSeek={(ms) => {
                setSeekMs(ms);
                const target = clipsForTimeline.find((c) => ms >= c.startMs && ms <= c.endMs);
                if (target) setPlaying(target);
              }}
            />
          </section>
        </Reveal>
      ) : null}

      <section>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium text-fg">Cortes gerados</h2>
          <Tabs value={topFilter} onValueChange={setTopFilter} className="ml-auto">
            <TabsList>
              {TOP_FILTERS.map((filter) => (
                <TabsTrigger key={filter.value} value={filter.value}>
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {gridClips ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {gridClips
              .slice()
              .sort((a, b) => b.score - a.score)
              .map((clip) => (
                <button key={clip.id} onClick={() => setPlaying(clip)} className="text-left">
                  <TopClipCard clip={clip} />
                </button>
              ))}
          </div>
        ) : (
          <ClipGrid projectId={projectId} filters={filters} onPlay={handlePlay} />
        )}
      </section>

      <Dialog open={Boolean(playing)} onOpenChange={(open) => !open && setPlaying(null)}>
        <DialogContent className="max-w-md p-0">
          {playing ? (
            <ClipPlayer
              clip={playing}
              onNext={
                playingIndex >= 0 && playingIndex < clipsForTimeline.length - 1
                  ? () => setPlaying(clipsForTimeline[playingIndex + 1]!)
                  : undefined
              }
              onPrevious={
                playingIndex > 0 ? () => setPlaying(clipsForTimeline[playingIndex - 1]!) : undefined
              }
              className="border-0"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Versão compacta usada nos filtros Top N, onde a grade já vem paginada em memória. */
function TopClipCard({ clip }: { clip: Clip }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface transition-colors hover:border-border-strong">
      <div className="relative aspect-[9/16] bg-surface-2">
        {clip.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={clip.thumbnailUrl} alt="" className="size-full object-cover" loading="lazy" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <span className="tabular absolute left-3 top-3 rounded-full bg-black/60 px-2 py-0.5 text-2xs font-medium text-violet-glow backdrop-blur-sm">
          {clip.score.toFixed(0)}
        </span>
      </div>
      <p className="line-clamp-2 p-3 text-sm leading-snug text-fg">{clip.title}</p>
    </div>
  );
}

// ── estados auxiliares ───────────────────────────────────────────────────────

function FailureBanner({ projectId, hint }: { projectId: string; hint: string }) {
  const retry = useRetryProject();

  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-danger/25 bg-danger/8 p-5">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" />
      <div className="flex-1">
        <h2 className="text-sm font-medium text-fg">Não conseguimos concluir o processamento</h2>
        <p className="mt-1 text-sm text-fg-muted">{hint}</p>
      </div>
      <Button
        variant="secondary"
        size="sm"
        loading={retry.isPending}
        onClick={() => retry.mutate(projectId)}
      >
        <RefreshCw />
        Tentar de novo
      </Button>
    </div>
  );
}

function ProjectSkeleton() {
  return (
    <>
      <Topbar />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
          <Skeleton className="h-[340px] rounded-xl" />
          <Skeleton className="h-[340px] rounded-xl" />
        </div>
      </main>
    </>
  );
}
