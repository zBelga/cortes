import { Injectable, Logger } from '@nestjs/common';
import { StageStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { PIPELINE_STAGES, TOTAL_WEIGHT, type StageKey } from '../queue/queue.constants';
import { pipelineChannel, type PipelineEvent } from '../realtime/pipeline-events';

interface StageUpdate {
  status?: StageStatus;
  progress?: number;
  message?: string;
  errorCode?: string;
  errorMessage?: string;
}

/** Não inundar o WebSocket: 4 eventos por segundo já parecem contínuos ao olho. */
const EMIT_THROTTLE_MS = 250;

@Injectable()
export class PipelineProgressService {
  private readonly logger = new Logger(PipelineProgressService.name);
  private readonly lastEmit = new Map<string, number>();
  private readonly startedAt = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Cria o run com as 13 etapas em PENDING — a tela já nasce completa. */
  async initialize(projectId: string): Promise<void> {
    await this.prisma.pipelineRun.upsert({
      where: { projectId },
      update: { status: StageStatus.PENDING, progress: 0, startedAt: null, finishedAt: null },
      create: {
        projectId,
        stages: {
          create: PIPELINE_STAGES.map((stage, order) => ({
            key: stage.key,
            label: stage.label,
            order,
          })),
        },
      },
    });
  }

  async startStage(projectId: string, key: StageKey, message?: string): Promise<void> {
    this.startedAt.set(`${projectId}:${key}`, Date.now());
    await this.update(projectId, key, { status: StageStatus.RUNNING, progress: 0, message });
  }

  async progressStage(projectId: string, key: StageKey, progress: number, message?: string) {
    await this.update(projectId, key, { status: StageStatus.RUNNING, progress, message }, true);
  }

  async completeStage(projectId: string, key: StageKey, message?: string): Promise<void> {
    await this.update(projectId, key, { status: StageStatus.COMPLETED, progress: 1, message });
  }

  async failStage(projectId: string, key: StageKey, code: string, message: string): Promise<void> {
    await this.update(projectId, key, {
      status: StageStatus.FAILED,
      errorCode: code,
      errorMessage: message,
    });
  }

  /**
   * `throttled` evita uma escrita no Postgres a cada 1% de FFmpeg.
   * O evento em tempo real vai pelo Redis; o banco recebe apenas
   * transições de estado e amostras esparsas.
   */
  private async update(
    projectId: string,
    key: StageKey,
    patch: StageUpdate,
    throttled = false,
  ): Promise<void> {
    const throttleKey = `${projectId}:${key}`;
    const now = Date.now();

    if (throttled) {
      const last = this.lastEmit.get(throttleKey) ?? 0;
      if (now - last < EMIT_THROTTLE_MS) return;
      this.lastEmit.set(throttleKey, now);
    }

    const stage = PIPELINE_STAGES.find((s) => s.key === key);
    if (!stage) return;

    const run = await this.prisma.pipelineRun.findUnique({
      where: { projectId },
      select: { id: true, stages: { select: { key: true, status: true, progress: true } } },
    });
    if (!run) return;

    const overallProgress = this.computeOverall(run.stages, key, patch);

    // Escrita esparsa: em progresso intermediário, só o WebSocket é atualizado.
    const shouldPersist = !throttled || (patch.progress ?? 0) >= 1;

    if (shouldPersist) {
      const durationMs = this.startedAt.has(throttleKey)
        ? now - this.startedAt.get(throttleKey)!
        : undefined;

      await this.prisma.$transaction([
        this.prisma.pipelineStage.update({
          where: { pipelineRunId_key: { pipelineRunId: run.id, key } },
          data: {
            status: patch.status,
            progress: patch.progress,
            errorCode: patch.errorCode,
            errorMessage: patch.errorMessage,
            ...(patch.status === 'RUNNING' ? { startedAt: new Date(), attempts: { increment: 1 } } : {}),
            ...(patch.status === 'COMPLETED' || patch.status === 'FAILED'
              ? { finishedAt: new Date(), durationMs }
              : {}),
          },
        }),
        this.prisma.pipelineRun.update({
          where: { id: run.id },
          data: {
            progress: overallProgress,
            currentStage: key,
            status: patch.status === 'FAILED' ? StageStatus.FAILED : StageStatus.RUNNING,
            ...(overallProgress === 0 ? { startedAt: new Date() } : {}),
          },
        }),
      ]);
    }

    const event: PipelineEvent = {
      type: 'stage.update',
      projectId,
      stage: key,
      label: stage.label,
      status: patch.status ?? StageStatus.RUNNING,
      progress: patch.progress ?? 0,
      overallProgress,
      etaSeconds: this.estimateEta(projectId, overallProgress),
      message: patch.message,
      at: now,
    };
    await this.redis.publish(pipelineChannel(projectId), event);
  }

  private computeOverall(
    stages: { key: string; status: StageStatus; progress: number }[],
    currentKey: string,
    patch: StageUpdate,
  ): number {
    let earned = 0;

    for (const definition of PIPELINE_STAGES) {
      const isCurrent = definition.key === currentKey;
      const stage = stages.find((s) => s.key === definition.key);

      const status = isCurrent ? (patch.status ?? stage?.status) : stage?.status;
      const progress = isCurrent ? (patch.progress ?? stage?.progress ?? 0) : (stage?.progress ?? 0);

      if (status === StageStatus.COMPLETED || status === StageStatus.SKIPPED) {
        earned += definition.weight;
      } else if (status === StageStatus.RUNNING) {
        earned += definition.weight * Math.min(1, Math.max(0, progress));
      }
    }
    return Math.round((earned / TOTAL_WEIGHT) * 1000) / 1000;
  }

  /** ETA por extrapolação linear do progresso já realizado. Simples e honesto. */
  private estimateEta(projectId: string, overallProgress: number): number | null {
    const key = `run:${projectId}`;
    const started = this.startedAt.get(key) ?? this.startedAt.set(key, Date.now()).get(key)!;
    if (overallProgress <= 0.02) return null;

    const elapsed = Date.now() - started;
    const total = elapsed / overallProgress;
    return Math.max(0, Math.round((total - elapsed) / 1000));
  }

  async finish(projectId: string, clipCount: number): Promise<void> {
    await this.prisma.pipelineRun.update({
      where: { projectId },
      data: { status: StageStatus.COMPLETED, progress: 1, finishedAt: new Date(), currentStage: null },
    });
    await this.redis.publish(pipelineChannel(projectId), {
      type: 'pipeline.completed',
      projectId,
      clipCount,
      at: Date.now(),
    } satisfies PipelineEvent);
    this.cleanup(projectId);
  }

  async abort(projectId: string, errorCode: string, errorHint: string): Promise<void> {
    await this.prisma.pipelineRun.update({
      where: { projectId },
      data: { status: StageStatus.FAILED, finishedAt: new Date() },
    });
    await this.redis.publish(pipelineChannel(projectId), {
      type: 'pipeline.failed',
      projectId,
      errorCode,
      errorHint,
      at: Date.now(),
    } satisfies PipelineEvent);
    this.cleanup(projectId);
  }

  /** Evita vazamento de memória nos mapas de throttle em workers de longa duração. */
  private cleanup(projectId: string): void {
    for (const key of [...this.lastEmit.keys()]) {
      if (key.startsWith(projectId)) this.lastEmit.delete(key);
    }
    for (const key of [...this.startedAt.keys()]) {
      if (key.startsWith(projectId) || key === `run:${projectId}`) this.startedAt.delete(key);
    }
  }
}
