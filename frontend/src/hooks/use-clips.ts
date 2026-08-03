'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Clip, Page, TimelinePoint } from '@/types/api';

export interface ClipFilters {
  minScore?: number;
  category?: string;
  favorite?: boolean;
  sort?: 'top' | 'timeline';
}

export function useClips(projectId: string, filters: ClipFilters = {}, enabled = true) {
  return useInfiniteQuery({
    queryKey: queryKeys.clips.byProject(projectId, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '24', sort: filters.sort ?? 'top' });
      if (pageParam) params.set('cursor', pageParam);
      if (filters.minScore !== undefined) params.set('minScore', String(filters.minScore));
      if (filters.category) params.set('category', filters.category);
      if (filters.favorite) params.set('favorite', 'true');
      return api.get<Page<Clip>>(`/projects/${projectId}/clips?${params}`);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
  });
}

export function useTimeline(projectId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.projects.timeline(projectId),
    queryFn: () => api.get<TimelinePoint[]>(`/projects/${projectId}/timeline`),
    enabled,
    // A curva não muda depois de calculada — não há motivo para revalidar.
    staleTime: Infinity,
  });
}

export function useToggleFavorite(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, favorite }: { id: string; favorite: boolean }) =>
      api.patch<Clip>(`/clips/${id}`, { favorite }),
    onMutate: async ({ id, favorite }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.clips.byProject(projectId) });
      const snapshot = queryClient.getQueriesData({ queryKey: queryKeys.clips.byProject(projectId) });

      queryClient.setQueriesData<{ pages: Page<Clip>[] }>(
        { queryKey: queryKeys.clips.byProject(projectId) },
        (data) =>
          data && {
            ...data,
            pages: data.pages.map((page) => ({
              ...page,
              items: page.items.map((clip) => (clip.id === id ? { ...clip, favorite } : clip)),
            })),
          },
      );
      return { snapshot };
    },
    onError: (_e, _v, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
  });
}
