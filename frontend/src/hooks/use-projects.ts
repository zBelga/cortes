'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import type { Page, ProjectDetail, ProjectSummary } from '@/types/api';

export function useProjects(filters: { status?: string; q?: string } = {}) {
  return useQuery({
    queryKey: queryKeys.projects.list(filters),
    queryFn: () => {
      const params = new URLSearchParams({ limit: '24' });
      if (filters.status) params.set('status', filters.status);
      if (filters.q) params.set('q', filters.q);
      return api.get<Page<ProjectSummary>>(`/projects?${params}`);
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: queryKeys.projects.detail(id),
    queryFn: () => api.get<ProjectDetail>(`/projects/${id}`),
  });
}

interface CreateProjectInput {
  source: 'YOUTUBE' | 'TWITCH' | 'UPLOAD';
  url?: string;
  storageKey?: string;
  preferences?: { minScore?: number; maxClips?: number };
}

export function useCreateProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProjectInput) =>
      api.post<{ id: string; title: string; estimatedCredits: number }>('/projects', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.billing.balance });
    },
    onError: (error) => {
      // A mensagem do backend já é redigida para o usuário final.
      toast.error(error instanceof ApiError ? error.message : 'Não foi possível criar o projeto');
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.delete(`/projects/${id}`),
    // Atualização otimista: a linha some na hora; volta se o servidor recusar.
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.projects.all });
      const snapshot = queryClient.getQueriesData<Page<ProjectSummary>>({
        queryKey: queryKeys.projects.all,
      });

      queryClient.setQueriesData<Page<ProjectSummary>>({ queryKey: queryKeys.projects.all }, (page) =>
        page ? { ...page, items: page.items.filter((p) => p.id !== id) } : page,
      );
      return { snapshot };
    },
    onError: (_error, _id, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
      toast.error('Não foi possível excluir o projeto');
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all }),
  });
}

export function useRetryProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/projects/${id}/retry`),
    onSuccess: (_data, id) => {
      toast.success('Reprocessamento iniciado');
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.projects.pipeline(id) });
    },
  });
}
