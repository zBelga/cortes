'use client';

import * as React from 'react';
import { AnimatePresence } from 'framer-motion';
import { Scissors } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { useClips, useToggleFavorite, type ClipFilters } from '@/hooks/use-clips';
import { api } from '@/lib/api';
import type { Clip } from '@/types/api';
import { ClipCard } from './clip-card';

interface ClipGridProps {
  projectId: string;
  filters: ClipFilters;
  onPlay: (clip: Clip) => void;
}

export function ClipGrid({ projectId, filters, onPlay }: ClipGridProps) {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useClips(
    projectId,
    filters,
  );
  const toggleFavorite = useToggleFavorite(projectId);

  // Callbacks estáveis: junto com o memo do ClipCard, mantêm a grade fluida.
  const handleFavorite = React.useCallback(
    (clip: Clip) => toggleFavorite.mutate({ id: clip.id, favorite: !clip.favorite }),
    [toggleFavorite],
  );

  const handleExport = React.useCallback(async (clip: Clip) => {
    const promise = api.post(`/clips/${clip.id}/exports`, {
      aspectRatio: 'VERTICAL_9_16',
      resolution: '1080p',
      fps: 30,
      captionStyle: 'HORMOZI',
    });
    toast.promise(promise, {
      loading: 'Enviando para a fila de exportação…',
      success: 'Exportação iniciada. Avisamos quando terminar.',
      error: (error: Error) => error.message,
    });
  }, []);

  const clips = React.useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  if (isLoading) return <ClipGridSkeleton />;

  if (!clips.length) {
    return (
      <EmptyState
        icon={<Scissors />}
        title="Nenhum corte com esses filtros"
        description="Tente reduzir a nota mínima ou remover o filtro de categoria para ver mais opções."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
        <AnimatePresence mode="popLayout">
          {clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onPlay={onPlay}
              onToggleFavorite={handleFavorite}
              onExport={handleExport}
            />
          ))}
        </AnimatePresence>
      </div>

      {hasNextPage ? (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            loading={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            Carregar mais cortes
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ClipGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="overflow-hidden rounded-xl border border-border bg-surface">
          <Skeleton className="aspect-[9/16] rounded-none" />
          <div className="space-y-2 p-3.5">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}
