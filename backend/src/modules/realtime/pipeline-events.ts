import type { StageStatus } from '@prisma/client';

export const pipelineChannel = (projectId: string) => `pipeline:${projectId}`;
export const projectRoom = (projectId: string) => `project:${projectId}`;

export interface StageUpdateEvent {
  type: 'stage.update';
  projectId: string;
  stage: string;
  label: string;
  status: StageStatus;
  /** 0..1 dentro da etapa. */
  progress: number;
  /** 0..1 do pipeline inteiro, ponderado por `weight`. */
  overallProgress: number;
  etaSeconds: number | null;
  message?: string;
  at: number;
}

export interface PipelineDoneEvent {
  type: 'pipeline.completed' | 'pipeline.failed';
  projectId: string;
  clipCount?: number;
  errorCode?: string;
  errorHint?: string;
  at: number;
}

export type PipelineEvent = StageUpdateEvent | PipelineDoneEvent;
