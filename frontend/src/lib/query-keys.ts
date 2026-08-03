/**
 * Chaves de cache hierárquicas: invalidar `['projects']` invalida todas as
 * listas e detalhes de projeto de uma vez, sem enumerar variantes.
 */
export const queryKeys = {
  projects: {
    all: ['projects'] as const,
    list: (filters?: Record<string, unknown>) => ['projects', 'list', filters ?? {}] as const,
    detail: (id: string) => ['projects', 'detail', id] as const,
    pipeline: (id: string) => ['projects', 'pipeline', id] as const,
    timeline: (id: string) => ['projects', 'timeline', id] as const,
  },
  clips: {
    all: ['clips'] as const,
    byProject: (projectId: string, filters?: Record<string, unknown>) =>
      ['clips', projectId, filters ?? {}] as const,
    detail: (id: string) => ['clips', 'detail', id] as const,
  },
  exports: {
    all: ['exports'] as const,
    detail: (id: string) => ['exports', 'detail', id] as const,
  },
  billing: { balance: ['billing', 'balance'] as const, history: ['billing', 'history'] as const },
  admin: { metrics: ['admin', 'metrics'] as const, queues: ['admin', 'queues'] as const },
} as const;
