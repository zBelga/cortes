import { Injectable, Logger } from '@nestjs/common';
import { MediaKind, ProjectSource, ProjectStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';
import { StoragePort } from '../../infra/storage/storage.port';
import { StorageKeys } from '../../infra/storage/storage-keys';
import { YtdlpService } from '../../infra/media/ytdlp.service';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { cursorArgs, toPage } from '../../common/utils/pagination';
import { QueueService } from '../queue/queue.service';
import { CreditsService, creditsForDuration } from '../billing/credits.service';
import { PipelineProgressService } from '../pipeline/pipeline-progress.service';
import { PIPELINE_STAGES } from '../queue/queue.constants';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CreateProjectDto, ListProjectsDto } from './dto/create-project.dto';

const LIST_SELECT = {
  id: true,
  title: true,
  source: true,
  status: true,
  clipCount: true,
  averageScore: true,
  bestScore: true,
  secondsSaved: true,
  failureHint: true,
  createdAt: true,
  completedAt: true,
} as const;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly storage: StoragePort,
    private readonly ytdlp: YtdlpService,
    private readonly queue: QueueService,
    private readonly credits: CreditsService,
    private readonly progress: PipelineProgressService,
  ) {}

  async create(user: AuthenticatedUser, dto: CreateProjectDto) {
    // A duração define o custo. Descobrimos ANTES de reservar crédito e enfileirar:
    // um metadata do yt-dlp custa ~1s; um download de 2h custa 20 minutos de worker.
    const metadata =
      dto.source === ProjectSource.UPLOAD ? null : await this.ytdlp.metadata(dto.url!);

    const durationMs = metadata?.durationMs ?? 0;
    const estimatedCredits = creditsForDuration(durationMs || 10 * 60_000);

    const project = await this.prisma.project.create({
      data: {
        userId: user.id,
        title: dto.title ?? metadata?.title ?? 'Novo projeto',
        source: dto.source,
        sourceUrl: dto.url ?? null,
        externalId: metadata?.externalId ?? null,
        status: ProjectStatus.QUEUED,
        preferences: (dto.preferences ?? {}) as never,
        ...(dto.storageKey
          ? {
              media: {
                create: {
                  kind: MediaKind.SOURCE_VIDEO,
                  storageKey: dto.storageKey,
                  mimeType: 'video/mp4',
                  sizeBytes: BigInt(0),
                },
              },
            }
          : {}),
      },
      select: { id: true, title: true, status: true, createdAt: true },
    });

    // Ordem importa: reservar crédito ANTES de enfileirar. Se a reserva falhar,
    // nada foi processado; se o enfileiramento falhar, o crédito é estornado.
    try {
      await this.credits.reserve(user.id, project.id, estimatedCredits);
      await this.progress.initialize(project.id);
      await this.queue.enqueuePipeline({ projectId: project.id, userId: user.id, plan: user.plan });
    } catch (error) {
      await this.prisma.project.delete({ where: { id: project.id } }).catch(() => undefined);
      throw error;
    }

    await this.invalidateList(user.id);
    return { ...project, estimatedCredits, estimatedDurationMs: durationMs };
  }

  async list(userId: string, query: ListProjectsDto) {
    const rows = await this.prisma.project.findMany({
      where: {
        userId,
        deletedAt: null,
        ...(query.status ? { status: query.status as ProjectStatus } : {}),
        ...(query.q ? { title: { contains: query.q, mode: 'insensitive' } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      // +1 para saber se há próxima página sem um COUNT adicional
      take: query.limit + 1,
      ...cursorArgs(query.cursor),
      select: LIST_SELECT,
    });

    return toPage(rows, query.limit);
  }

  async detail(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId, deletedAt: null },
      select: {
        ...LIST_SELECT,
        description: true,
        sourceUrl: true,
        preferences: true,
        failureCode: true,
        media: { select: { kind: true, storageKey: true, durationMs: true, width: true, height: true } },
        transcript: { select: { language: true, confidence: true, wordCount: true } },
      },
    });
    if (!project) throw new NotFoundError('Projeto', projectId);

    const waveform = project.media.find((m) => m.kind === MediaKind.WAVEFORM);
    return {
      ...project,
      waveformUrl: waveform ? await this.storage.presignDownload(waveform.storageKey, 3600) : null,
    };
  }

  /** Estado das 13 etapas — fonte da verdade que reconcilia o WebSocket. */
  async pipeline(userId: string, projectId: string) {
    const run = await this.prisma.pipelineRun.findFirst({
      where: { projectId, project: { userId, deletedAt: null } },
      select: {
        status: true,
        progress: true,
        currentStage: true,
        startedAt: true,
        finishedAt: true,
        stages: {
          orderBy: { order: 'asc' },
          select: {
            key: true,
            label: true,
            order: true,
            status: true,
            progress: true,
            durationMs: true,
            errorCode: true,
            errorMessage: true,
          },
        },
      },
    });

    if (!run) {
      // Projeto recém-criado: devolve o esqueleto para a UI já desenhar as etapas.
      return {
        status: 'PENDING',
        progress: 0,
        currentStage: null,
        startedAt: null,
        finishedAt: null,
        stages: PIPELINE_STAGES.map((stage, order) => ({
          key: stage.key,
          label: stage.label,
          order,
          status: 'PENDING' as const,
          progress: 0,
          durationMs: null,
          errorCode: null,
          errorMessage: null,
        })),
      };
    }
    return run;
  }

  async retry(user: AuthenticatedUser, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId: user.id, deletedAt: null },
      select: { id: true, status: true },
    });
    if (!project) throw new NotFoundError('Projeto', projectId);
    if (project.status === ProjectStatus.PROCESSING) {
      throw new ValidationError('Este projeto já está sendo processado');
    }

    await this.prisma.project.update({
      where: { id: projectId },
      data: { status: ProjectStatus.QUEUED, failureCode: null, failureHint: null },
    });
    await this.queue.cancelProject(projectId); // limpa jobs antigos com o mesmo jobId
    await this.progress.initialize(projectId);
    await this.queue.enqueuePipeline({ projectId, userId: user.id, plan: user.plan });

    await this.invalidateList(user.id);
    return { ok: true };
  }

  async remove(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId, deletedAt: null },
      select: { id: true },
    });
    if (!project) throw new NotFoundError('Projeto', projectId);

    await this.prisma.project.update({ where: { id: projectId }, data: { deletedAt: new Date() } });
    await this.queue.cancelProject(projectId);

    // Storage é limpo em background: o usuário não deve esperar por isso.
    void this.storage
      .deletePrefix(StorageKeys.projectPrefix(userId, projectId))
      .catch((error: Error) => this.logger.warn(`Falha ao limpar storage: ${error.message}`));

    await this.invalidateList(userId);
    return { ok: true };
  }

  private async invalidateList(userId: string): Promise<void> {
    await this.redis.invalidate(`projects:${userId}:*`);
  }
}
