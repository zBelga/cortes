import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, type JobsOptions } from 'bullmq';
import type { PlanTier } from '@prisma/client';
import { RedisService } from '../../infra/redis/redis.service';
import { jobKey } from '../../common/utils/hash';
import {
  DEFAULT_JOB_OPTIONS,
  JOB_QUEUE,
  QUEUES,
  computePriority,
  type PipelineJobName,
  type QueueName,
} from './queue.constants';

export interface PipelineJobData {
  projectId: string;
  userId: string;
  plan: PlanTier;
  /** Quando presente, o job pula etapas já concluídas (retry parcial). */
  resume?: boolean;
}

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(private readonly redis: RedisService) {
    for (const name of Object.values(QUEUES)) {
      this.queues.set(name, new Queue(name, { connection: this.redis.client.duplicate() }));
    }
  }

  queue(name: QueueName): Queue {
    const queue = this.queues.get(name);
    if (!queue) throw new Error(`Fila desconhecida: ${name}`);
    return queue;
  }

  /** Enfileira o primeiro job do pipeline; cada job encadeia o seguinte ao concluir. */
  async enqueuePipeline(data: PipelineJobData): Promise<void> {
    await this.enqueueJob('ingest', data);
    this.logger.log(`Pipeline enfileirado para o projeto ${data.projectId}`);
  }

  async enqueueJob(
    name: PipelineJobName,
    data: PipelineJobData,
    options: JobsOptions = {},
  ): Promise<void> {
    await this.queue(JOB_QUEUE[name]).add(name, data, {
      ...DEFAULT_JOB_OPTIONS,
      priority: computePriority(data.plan),
      // jobId determinístico: um replay não duplica trabalho nem consome créditos de novo.
      jobId: jobKey(data.projectId, name),
      ...options,
    });
  }

  async enqueueRender(exportId: string, userId: string, plan: PlanTier): Promise<void> {
    await this.queue(QUEUES.RENDER).add(
      'export',
      { exportId, userId },
      {
        ...DEFAULT_JOB_OPTIONS,
        priority: computePriority(plan),
        jobId: jobKey('export', exportId),
      },
    );
  }

  async enqueueWebhook(endpointId: string, event: string, payload: unknown): Promise<void> {
    await this.queue(QUEUES.WEBHOOKS).add(
      'deliver',
      { endpointId, event, payload },
      { attempts: 5, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: true },
    );
  }

  /** Remove os jobs de um projeto — usado no cancelamento e no delete. */
  async cancelProject(projectId: string): Promise<void> {
    await Promise.all(
      (['ingest', 'understand', 'compose', 'finalize'] as PipelineJobName[]).map(async (name) => {
        const job = await this.queue(JOB_QUEUE[name]).getJob(jobKey(projectId, name));
        await job?.remove().catch(() => undefined);
      }),
    );
  }

  /** Snapshot para o painel admin. */
  async stats() {
    const entries = await Promise.all(
      [...this.queues.entries()].map(async ([name, queue]) => {
        const counts = await queue.getJobCounts(
          'waiting',
          'active',
          'delayed',
          'failed',
          'completed',
        );
        return [name, counts] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([...this.queues.values()].map((q) => q.close()));
  }
}
