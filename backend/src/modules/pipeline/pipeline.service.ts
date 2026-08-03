import { Injectable, Logger } from '@nestjs/common';
import { ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { QueueService, type PipelineJobData } from '../queue/queue.service';
import { CreditsService } from '../billing/credits.service';
import { WebhookDispatcher } from '../webhooks/webhook.dispatcher';
import { FatalJobError, isRetryable } from '../../common/errors/job-error';
import { nextJob, stagesOfJob, type PipelineJobName } from '../queue/queue.constants';
import { PipelineProgressService } from './pipeline-progress.service';
import { IngestStage } from './stages/ingest.stage';
import { UnderstandStage } from './stages/understand.stage';
import { ComposeStage } from './stages/compose.stage';
import { FinalizeStage } from './stages/finalize.stage';

/**
 * Orquestrador do pipeline. É o único lugar que conhece a sequência dos jobs,
 * a transição de estado do projeto e o que fazer quando algo falha.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly progress: PipelineProgressService,
    private readonly credits: CreditsService,
    private readonly webhooks: WebhookDispatcher,
    private readonly ingest: IngestStage,
    private readonly understand: UnderstandStage,
    private readonly compose: ComposeStage,
    private readonly finalize: FinalizeStage,
  ) {}

  /** Ponto de entrada dos processors do worker. */
  async runJob(name: PipelineJobName, data: PipelineJobData): Promise<void> {
    const started = Date.now();
    this.logger.log(`[${data.projectId}] job "${name}" iniciado`);

    try {
      await this.prisma.project.update({
        where: { id: data.projectId },
        data: { status: ProjectStatus.PROCESSING },
      });

      let clipCount = 0;
      switch (name) {
        case 'ingest':
          await this.ingest.execute(data);
          break;
        case 'understand':
          await this.understand.execute(data);
          break;
        case 'compose':
          await this.compose.execute(data);
          break;
        case 'finalize':
          clipCount = await this.finalize.execute(data);
          break;
      }

      const following = nextJob(name);
      if (following) {
        await this.queue.enqueueJob(following, data);
      } else {
        await this.complete(data, clipCount);
      }

      this.logger.log(`[${data.projectId}] job "${name}" concluído em ${Date.now() - started}ms`);
    } catch (error) {
      await this.handleFailure(name, data, error);
      throw error; // devolve ao BullMQ para que ele decida sobre o retry
    }
  }

  private async complete(data: PipelineJobData, clipCount: number): Promise<void> {
    await this.prisma.project.update({
      where: { id: data.projectId },
      data: { status: ProjectStatus.READY, completedAt: new Date(), failureCode: null, failureHint: null },
    });

    // Só agora o crédito reservado vira consumo definitivo.
    await this.credits.commit(data.userId, data.projectId);
    await this.progress.finish(data.projectId, clipCount);
    await this.webhooks.dispatch(data.userId, 'project.completed', {
      projectId: data.projectId,
      clipCount,
    });
  }

  /**
   * Falha transitória: marca a etapa, deixa o BullMQ tentar de novo.
   * Falha definitiva: encerra o projeto, **devolve o crédito** e avisa o usuário.
   */
  private async handleFailure(
    name: PipelineJobName,
    data: PipelineJobData,
    error: unknown,
  ): Promise<void> {
    const code = error instanceof FatalJobError ? error.code : 'PROCESSING_ERROR';
    const message = (error as Error).message ?? 'Erro desconhecido';

    // Marca a etapa que estava de fato rodando. Cair no primeiro passo do job
    // mostraria "Baixando vídeo" quando a falha foi na transcrição.
    const run = await this.prisma.pipelineRun.findUnique({
      where: { projectId: data.projectId },
      select: { currentStage: true },
    });
    const stageKey = run?.currentStage ?? stagesOfJob(name)[0]?.key ?? name;

    await this.progress.failStage(data.projectId, stageKey as never, code, message);

    if (isRetryable(error)) {
      this.logger.warn(`[${data.projectId}] falha transitória em "${name}": ${message}`);
      return;
    }

    const hint =
      error instanceof FatalJobError && error.hint
        ? error.hint
        : 'Não conseguimos processar este vídeo. Tente outro arquivo ou fale com o suporte.';

    await this.prisma.project.update({
      where: { id: data.projectId },
      data: { status: ProjectStatus.FAILED, failureCode: code, failureHint: hint },
    });

    await this.credits.release(data.userId, data.projectId);
    await this.progress.abort(data.projectId, code, hint);
    await this.webhooks.dispatch(data.userId, 'project.failed', {
      projectId: data.projectId,
      code,
      hint,
    });

    this.logger.error(`[${data.projectId}] falha definitiva em "${name}": ${code} — ${message}`);
  }
}
