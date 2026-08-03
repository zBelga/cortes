import type { PlanTier } from '@prisma/client';

/** Uma fila por perfil de recurso — ver docs/05-queues.md. */
export const QUEUES = {
  MEDIA: 'media',
  AI: 'ai',
  CPU: 'cpu',
  RENDER: 'render',
  WEBHOOKS: 'webhooks',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/**
 * O pipeline tem 13 **etapas** visíveis ao usuário, agrupadas em 4 **jobs**.
 *
 * O agrupamento não é cosmético: um job por etapa forçaria baixar de volta o
 * arquivo de vídeo a cada passo. Etapas que compartilham o mesmo artefato
 * local rodam no mesmo job, dentro do mesmo diretório temporário —
 * o vídeo é baixado uma vez, não seis.
 */
export const PIPELINE_JOBS = {
  INGEST: 'ingest',
  UNDERSTAND: 'understand',
  COMPOSE: 'compose',
  FINALIZE: 'finalize',
} as const;

export type PipelineJobName = (typeof PIPELINE_JOBS)[keyof typeof PIPELINE_JOBS];

export const JOB_QUEUE: Record<PipelineJobName, QueueName> = {
  ingest: QUEUES.MEDIA,
  understand: QUEUES.AI,
  compose: QUEUES.CPU,
  finalize: QUEUES.RENDER,
};

export const JOB_ORDER: PipelineJobName[] = ['ingest', 'understand', 'compose', 'finalize'];

/** `weight` define a fatia de cada etapa na barra de progresso global. */
export const PIPELINE_STAGES = [
  { key: 'download',           label: 'Baixando vídeo',                    job: 'ingest',     weight: 16 },
  { key: 'probe',              label: 'Lendo metadados',                   job: 'ingest',     weight: 2 },
  { key: 'extract-audio',      label: 'Extraindo áudio',                   job: 'ingest',     weight: 6 },
  { key: 'waveform',           label: 'Gerando waveform',                  job: 'ingest',     weight: 4 },
  { key: 'analyze-audio',      label: 'Detectando risadas, gritos e energia', job: 'ingest',  weight: 7 },
  { key: 'analyze-visual',     label: 'Detectando cenas e movimento',      job: 'ingest',     weight: 9 },
  { key: 'transcribe',         label: 'Transcrevendo',                     job: 'understand', weight: 22 },
  { key: 'detect-language',    label: 'Detectando idioma',                 job: 'understand', weight: 1 },
  { key: 'analyze-semantics',  label: 'Encontrando momentos marcantes',    job: 'understand', weight: 11 },
  { key: 'score',              label: 'Calculando Score de Viralização',   job: 'compose',    weight: 4 },
  { key: 'select-clips',       label: 'Criando cortes',                    job: 'compose',    weight: 3 },
  { key: 'render-previews',    label: 'Gerando previews',                  job: 'finalize',   weight: 12 },
  { key: 'generate-marketing', label: 'Escrevendo títulos e hashtags',     job: 'finalize',   weight: 3 },
] as const satisfies readonly {
  key: string;
  label: string;
  job: PipelineJobName;
  weight: number;
}[];

export type StageKey = (typeof PIPELINE_STAGES)[number]['key'];

export const TOTAL_WEIGHT = PIPELINE_STAGES.reduce((sum, stage) => sum + stage.weight, 0);

export const stagesOfJob = (job: PipelineJobName) => PIPELINE_STAGES.filter((s) => s.job === job);

export const nextJob = (job: PipelineJobName): PipelineJobName | null =>
  JOB_ORDER[JOB_ORDER.indexOf(job) + 1] ?? null;

/** Menor número = maior prioridade no BullMQ. */
const BASE_PRIORITY: Record<PlanTier, number> = {
  ENTERPRISE: 1,
  PRO: 10,
  STARTER: 50,
  FREE: 100,
};

/**
 * Prioridade com bônus por espera: sem ele, uma enxurrada de jobs PRO
 * deixaria usuários FREE presos na fila indefinidamente (starvation).
 */
export function computePriority(plan: PlanTier, enqueuedAt = Date.now()): number {
  const waitedMinutes = (Date.now() - enqueuedAt) / 60_000;
  const bonus = Math.min(40, Math.floor(waitedMinutes / 2));
  return Math.max(1, BASE_PRIORITY[plan] - bonus);
}

export const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 5_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
} as const;
