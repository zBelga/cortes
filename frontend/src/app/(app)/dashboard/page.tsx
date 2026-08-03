'use client';

import Link from 'next/link';
import { Clapperboard, Clock, Plus, Scissors, Sparkles } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { StatCard } from '@/components/dashboard/stat-card';
import { ProjectCard } from '@/components/projects/project-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Reveal, staggerDelay } from '@/components/motion/reveal';
import { useProjects } from '@/hooks/use-projects';
import { formatDuration } from '@/lib/utils';

export default function DashboardPage() {
  const { data, isLoading } = useProjects();
  const projects = data?.items ?? [];

  const ready = projects.filter((p) => p.status === 'READY');
  const totalClips = ready.reduce((sum, p) => sum + p.clipCount, 0);
  const secondsSaved = ready.reduce((sum, p) => sum + p.secondsSaved, 0);
  const bestScore = ready.length ? Math.max(...ready.map((p) => p.bestScore)) : 0;

  return (
    <>
      <Topbar title="Dashboard" />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[132px] rounded-xl" />)
          ) : (
            <>
              <StatCard
                label="Projetos"
                value={projects.length}
                hint={`${ready.length} concluídos`}
                icon={<Clapperboard />}
                accent="blue"
                delay={0}
              />
              <StatCard
                label="Cortes gerados"
                value={totalClips}
                hint="prontos para publicar"
                icon={<Scissors />}
                accent="violet"
                delay={0.04}
              />
              <StatCard
                label="Tempo economizado"
                value={formatDuration(secondsSaved)}
                hint="versus revisar à mão"
                icon={<Clock />}
                accent="cyan"
                delay={0.08}
              />
              <StatCard
                label="Melhor score"
                value={bestScore ? bestScore.toFixed(0) : '—'}
                hint="entre todos os cortes"
                icon={<Sparkles />}
                accent="success"
                delay={0.12}
              />
            </>
          )}
        </section>

        <section className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-fg">Projetos recentes</h2>
            <Button asChild variant="ghost" size="sm">
              <Link href="/projects">Ver todos</Link>
            </Button>
          </div>

          {isLoading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[168px] rounded-xl" />
              ))}
            </div>
          ) : projects.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {projects.slice(0, 6).map((project, index) => (
                <Reveal key={project.id} delay={staggerDelay(index)}>
                  <ProjectCard project={project} />
                </Reveal>
              ))}
            </div>
          ) : (
            <div className="panel">
              <EmptyState
                icon={<Clapperboard />}
                title="Nenhum projeto ainda"
                description="Cole o link de um vídeo do YouTube ou da Twitch e o ClipForge encontra os melhores momentos automaticamente."
                action={
                  <Button asChild variant="primary">
                    <Link href="/projects/new">
                      <Plus />
                      Criar primeiro projeto
                    </Link>
                  </Button>
                }
              />
            </div>
          )}
        </section>
      </main>
    </>
  );
}
