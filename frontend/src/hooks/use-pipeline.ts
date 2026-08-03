'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { accessToken } from '@/lib/supabase';
import { queryKeys } from '@/lib/query-keys';
import type { PipelineState, StageUpdateEvent } from '@/types/api';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3333';

interface LiveState {
  overallProgress: number;
  etaSeconds: number | null;
  currentStage: string | null;
  message: string | null;
}

/**
 * Estado do pipeline em tempo real.
 *
 * O HTTP é a fonte da verdade e o WebSocket é aceleração. Se a conexão cair,
 * o `refetchInterval` mantém a tela correta — a experiência degrada, não quebra.
 */
export function usePipeline(projectId: string, enabled = true) {
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [live, setLive] = useState<LiveState>({
    overallProgress: 0,
    etaSeconds: null,
    currentStage: null,
    message: null,
  });
  const [connected, setConnected] = useState(false);

  const query = useQuery({
    queryKey: queryKeys.projects.pipeline(projectId),
    queryFn: () => api.get<PipelineState>(`/projects/${projectId}/pipeline`),
    enabled,
    // Polling só existe como rede de segurança do WebSocket; é lento de propósito.
    refetchInterval: (q) => {
      const status = q.state.data?.status;
      return status === 'COMPLETED' || status === 'FAILED' ? false : 15_000;
    },
  });

  const applyStageUpdate = useCallback(
    (event: StageUpdateEvent) => {
      setLive({
        overallProgress: event.overallProgress,
        etaSeconds: event.etaSeconds,
        currentStage: event.stage,
        message: event.message ?? null,
      });

      // Atualização otimista do cache: a UI reage sem esperar um refetch.
      queryClient.setQueryData<PipelineState>(queryKeys.projects.pipeline(projectId), (previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          progress: event.overallProgress,
          currentStage: event.stage,
          stages: previous.stages.map((stage) =>
            stage.key === event.stage
              ? { ...stage, status: event.status, progress: event.progress }
              : stage,
          ),
        };
      });
    },
    [projectId, queryClient],
  );

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    void (async () => {
      const token = await accessToken();
      if (disposed) return;

      const socket = io(`${WS_URL}/pipeline`, {
        transports: ['websocket'],
        auth: { token },
        reconnectionDelay: 500,
        reconnectionDelayMax: 8_000,
      });
      socketRef.current = socket;

      socket.on('connect', () => {
        setConnected(true);
        socket.emit('subscribe', { projectId });
      });
      socket.on('disconnect', () => setConnected(false));
      socket.on('stage.update', applyStageUpdate);

      const finish = () => {
        // Ao terminar, revalida tudo o que depende do resultado.
        void queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(projectId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.projects.pipeline(projectId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.clips.byProject(projectId) });
        setLive((s) => ({ ...s, overallProgress: 1, etaSeconds: 0 }));
      };
      socket.on('pipeline.completed', finish);
      socket.on('pipeline.failed', finish);
    })();

    return () => {
      disposed = true;
      socketRef.current?.emit('unsubscribe', { projectId });
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [projectId, enabled, applyStageUpdate, queryClient]);

  const state = query.data;
  const progress = Math.max(live.overallProgress, state?.progress ?? 0);

  return {
    ...query,
    state,
    progress,
    etaSeconds: live.etaSeconds,
    message: live.message,
    currentStage: live.currentStage ?? state?.currentStage ?? null,
    connected,
    isRunning: state ? state.status !== 'COMPLETED' && state.status !== 'FAILED' : true,
  };
}
