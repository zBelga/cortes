'use client';

import * as React from 'react';
import Link from 'next/link';
import { Clapperboard, Plus, Search } from 'lucide-react';
import { Topbar } from '@/components/layout/topbar';
import { ProjectCard } from '@/components/projects/project-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Reveal, staggerDelay } from '@/components/motion/reveal';
import { useProjects } from '@/hooks/use-projects';
import { useDebounced } from '@/hooks/use-debounced';

const FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'PROCESSING', label: 'Processando' },
  { value: 'READY', label: 'Prontos' },
  { value: 'FAILED', label: 'Com falha' },
] as const;

export default function ProjectsPage() {
  const [status, setStatus] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  // Debounce: sem ele, cada tecla dispararia uma requisição.
  const query = useDebounced(search, 300);

  const { data, isLoading } = useProjects({
    status: status === 'all' ? undefined : status,
    q: query || undefined,
  });
  const projects = data?.items ?? [];
  const filtering = status !== 'all' || Boolean(query);

  return (
    <>
      <Topbar title="Projetos" />

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Tabs value={status} onValueChange={setStatus}>
            <TabsList>
              {FILTERS.map((filter) => (
                <TabsTrigger key={filter.value} value={filter.value}>
                  {filter.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="ml-auto w-full sm:w-64">
            <Input
              icon={<Search />}
              placeholder="Buscar projeto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[168px] rounded-xl" />
            ))}
          </div>
        ) : projects.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {projects.map((project, index) => (
              <Reveal key={project.id} delay={staggerDelay(index)}>
                <ProjectCard project={project} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="panel">
            <EmptyState
              icon={<Clapperboard />}
              title={filtering ? 'Nada encontrado' : 'Nenhum projeto ainda'}
              description={
                filtering
                  ? 'Ajuste a busca ou o filtro para encontrar o que procura.'
                  : 'Comece colando o link de um vídeo. O resto é com a gente.'
              }
              action={
                filtering ? undefined : (
                  <Button asChild variant="primary">
                    <Link href="/projects/new">
                      <Plus />
                      Novo projeto
                    </Link>
                  </Button>
                )
              }
            />
          </div>
        )}
      </main>
    </>
  );
}
