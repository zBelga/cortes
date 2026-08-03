import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { Worker, type Job } from 'bullmq';
import { AppModule } from './app.module';
import { env } from './config/env';
import { RedisService } from './infra/redis/redis.service';
import { PipelineService } from './modules/pipeline/pipeline.service';
import { RenderService } from './modules/exports/render.service';
import { WebhookDeliveryService } from './modules/webhooks/webhook-delivery.service';
import { QUEUES } from './modules/queue/queue.constants';
import type { PipelineJobData } from './modules/queue/queue.service';
import type { PipelineJobName } from './modules/queue/queue.constants';

/**
 * Processo do worker.
 *
 * Reutiliza o mesmo contêiner de DI da API (`createApplicationContext`, sem
 * servidor HTTP): os casos de uso são exatamente os mesmos, sem duplicação de
 * configuração. O que muda é apenas quem os dispara — fila em vez de request.
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Worker');
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  const config = env();
  const redis = app.get(RedisService);
  const pipeline = app.get(PipelineService);
  const render = app.get(RenderService);
  const webhooks = app.get(WebhookDeliveryService);

  const connection = () => redis.client.duplicate();

  const workers = [
    new Worker<PipelineJobData>(
      QUEUES.MEDIA,
      (job) => pipeline.runJob(job.name as PipelineJobName, job.data),
      { connection: connection(), concurrency: config.WORKER_MEDIA_CONCURRENCY },
    ),
    new Worker<PipelineJobData>(
      QUEUES.AI,
      (job) => pipeline.runJob(job.name as PipelineJobName, job.data),
      { connection: connection(), concurrency: config.WORKER_AI_CONCURRENCY },
    ),
    new Worker<PipelineJobData>(
      QUEUES.CPU,
      (job) => pipeline.runJob(job.name as PipelineJobName, job.data),
      { connection: connection(), concurrency: config.WORKER_CPU_CONCURRENCY },
    ),
    new Worker(
      QUEUES.RENDER,
      async (job: Job) => {
        if (job.name === 'export') {
          return render.run(job.data.exportId as string, (ratio) => job.updateProgress(ratio));
        }
        return pipeline.runJob(job.name as PipelineJobName, job.data as PipelineJobData);
      },
      { connection: connection(), concurrency: config.WORKER_RENDER_CONCURRENCY },
    ),
    new Worker(
      QUEUES.WEBHOOKS,
      (job: Job) => webhooks.deliver(job.data.endpointId, job.data.event, job.data.payload),
      { connection: connection(), concurrency: 32 },
    ),
  ];

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      logger.error(`[${worker.name}] job ${job?.id} falhou: ${error.message}`);
    });
    worker.on('error', (error) => logger.error(`[${worker.name}] erro: ${error.message}`));
  }

  logger.log(`Worker ativo — filas: ${workers.map((w) => w.name).join(', ')}`);

  /**
   * Shutdown gracioso: para de aceitar jobs novos e aguarda os ativos.
   * Sem isto, um deploy mataria um FFmpeg de 8 minutos no meio e o job
   * voltaria como "stalled" — desperdiçando todo o trabalho já feito.
   */
  const shutdown = async (signal: string): Promise<void> => {
    logger.log(`${signal} recebido — encerrando com elegância…`);
    const timeout = setTimeout(() => {
      logger.error('Timeout de shutdown atingido, forçando saída');
      process.exit(1);
    }, config.SHUTDOWN_TIMEOUT_MS);

    await Promise.allSettled(workers.map((w) => w.close()));
    await app.close();
    clearTimeout(timeout);
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void bootstrap();
