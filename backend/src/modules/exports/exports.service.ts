import { Injectable } from '@nestjs/common';
import { ExportStatus } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StoragePort } from '../../infra/storage/storage.port';
import { NotFoundError, ValidationError } from '../../common/errors/domain-error';
import { cursorArgs, toPage } from '../../common/utils/pagination';
import { QueueService } from '../queue/queue.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import type { CreateExportDto } from './dto/create-export.dto';

/** Quantos renders simultâneos cada plano pode ter na fila. */
const CONCURRENT_EXPORTS: Record<string, number> = {
  FREE: 1,
  STARTER: 3,
  PRO: 8,
  ENTERPRISE: 25,
};

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StoragePort,
    private readonly queue: QueueService,
  ) {}

  async create(user: AuthenticatedUser, clipId: string, dto: CreateExportDto) {
    const clip = await this.prisma.clip.findFirst({
      where: { id: clipId, deletedAt: null, project: { userId: user.id, deletedAt: null } },
      select: { id: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { editDocument: true } } },
    });
    if (!clip) throw new NotFoundError('Corte', clipId);

    // Limite por plano: sem isto, um usuário free enche a fila de render sozinho.
    const inFlight = await this.prisma.export.count({
      where: { userId: user.id, status: { in: [ExportStatus.QUEUED, ExportStatus.RENDERING] } },
    });
    const limit = CONCURRENT_EXPORTS[user.plan] ?? 1;
    if (inFlight >= limit) {
      throw new ValidationError(
        `Seu plano permite ${limit} exportação(ões) simultânea(s). Aguarde as atuais terminarem.`,
      );
    }

    // Snapshot da edição: reexportar meses depois produz exatamente o mesmo vídeo.
    const editSnapshot = dto.edit ?? clip.versions[0]?.editDocument ?? {};

    const record = await this.prisma.export.create({
      data: {
        clipId,
        userId: user.id,
        aspectRatio: dto.aspectRatio,
        resolution: dto.resolution,
        fps: dto.fps,
        captionStyle: dto.captionStyle,
        editSnapshot: editSnapshot as never,
      },
      select: { id: true, status: true, createdAt: true },
    });

    await this.queue.enqueueRender(record.id, user.id, user.plan);
    return record;
  }

  async detail(userId: string, exportId: string) {
    const record = await this.prisma.export.findFirst({
      where: { id: exportId, userId },
      select: {
        id: true,
        status: true,
        progress: true,
        aspectRatio: true,
        resolution: true,
        fps: true,
        captionStyle: true,
        storageKey: true,
        sizeBytes: true,
        errorCode: true,
        createdAt: true,
        completedAt: true,
        clip: { select: { id: true, title: true, durationMs: true } },
      },
    });
    if (!record) throw new NotFoundError('Exportação', exportId);

    const { sizeBytes, storageKey, ...rest } = record;
    return {
      ...rest,
      sizeBytes: sizeBytes ? Number(sizeBytes) : null,
      downloadUrl: storageKey ? await this.storage.presignDownload(storageKey, 3600) : null,
    };
  }

  async list(userId: string, limit: number, cursor?: string) {
    const rows = await this.prisma.export.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...cursorArgs(cursor),
      select: {
        id: true,
        status: true,
        progress: true,
        resolution: true,
        aspectRatio: true,
        createdAt: true,
        completedAt: true,
        clip: { select: { id: true, title: true, thumbnailKey: true } },
      },
    });
    return toPage(rows, limit);
  }
}
