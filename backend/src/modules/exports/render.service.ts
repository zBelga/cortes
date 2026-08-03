import { createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import { ExportStatus, MediaKind } from '@prisma/client';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { StoragePort } from '../../infra/storage/storage.port';
import { StorageKeys } from '../../infra/storage/storage-keys';
import { FfmpegService } from '../../infra/media/ffmpeg.service';
import { TempWorkspace } from '../../infra/media/temp-workspace';
import { FatalJobError } from '../../common/errors/job-error';
import { WebhookDispatcher } from '../webhooks/webhook.dispatcher';
import { RESOLUTIONS } from './dto/create-export.dto';

/** Retenção do arquivo exportado. */
const EXPORT_TTL_DAYS = 90;

/**
 * Render final. Aqui — e só aqui — há reencode de qualidade:
 * acontece uma vez, para o corte que o usuário escolheu de fato.
 */
@Injectable()
export class RenderService {
  private readonly logger = new Logger(RenderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StoragePort,
    private readonly ffmpeg: FfmpegService,
    private readonly webhooks: WebhookDispatcher,
  ) {}

  async run(exportId: string, onProgress?: (ratio: number) => void): Promise<void> {
    const record = await this.prisma.export.findUnique({
      where: { id: exportId },
      select: {
        id: true,
        userId: true,
        aspectRatio: true,
        resolution: true,
        fps: true,
        editSnapshot: true,
        clip: {
          select: {
            id: true,
            startMs: true,
            endMs: true,
            projectId: true,
            project: { select: { media: { select: { kind: true, storageKey: true } } } },
          },
        },
      },
    });
    if (!record) throw new FatalJobError('Exportação não encontrada', 'EXPORT_NOT_FOUND');

    const source = record.clip.project.media.find((m) => m.kind === MediaKind.SOURCE_VIDEO);
    if (!source) {
      throw new FatalJobError(
        'Vídeo fonte expirado',
        'SOURCE_EXPIRED',
        'A mídia original deste projeto já foi removida. Reprocesse o projeto para exportar de novo.',
      );
    }

    await this.prisma.export.update({
      where: { id: exportId },
      data: { status: ExportStatus.RENDERING, progress: 0 },
    });

    try {
      await TempWorkspace.withWorkspace(`export-${exportId}`, async (ws) => {
        const input = ws.path('source.mp4');
        const output = ws.path('output.mp4');

        await streamPipeline(await this.storage.getStream(source.storageKey), createWriteStream(input));

        const [width, height] = RESOLUTIONS[record.resolution as keyof typeof RESOLUTIONS][record.aspectRatio];
        const edit = record.editSnapshot as { trim?: { startMs: number; endMs: number } };

        await this.ffmpeg.cut(
          input,
          output,
          {
            startMs: edit.trim?.startMs ?? record.clip.startMs,
            endMs: edit.trim?.endMs ?? record.clip.endMs,
            width,
            height,
            fps: record.fps,
            crf: record.resolution === '2160p' ? 18 : 20,
          },
          async (ratio) => {
            onProgress?.(ratio);
            // Persistência esparsa: a cada 10% e não a cada frame.
            if (Math.round(ratio * 100) % 10 === 0) {
              await this.prisma.export
                .update({ where: { id: exportId }, data: { progress: ratio } })
                .catch(() => undefined);
            }
          },
        );

        const key = StorageKeys.export(record.userId, exportId);
        const { size } = await this.storage.putFile(key, output, 'video/mp4');
        const stat = await fs.stat(output);

        await this.prisma.export.update({
          where: { id: exportId },
          data: {
            status: ExportStatus.COMPLETED,
            progress: 1,
            storageKey: key,
            sizeBytes: BigInt(size || stat.size),
            completedAt: new Date(),
          },
        });
      });

      await this.webhooks.dispatch(record.userId, 'export.completed', {
        exportId,
        clipId: record.clip.id,
      });
      this.logger.log(`Exportação ${exportId} concluída`);
    } catch (error) {
      await this.prisma.export.update({
        where: { id: exportId },
        data: {
          status: ExportStatus.FAILED,
          errorCode: error instanceof FatalJobError ? error.code : 'RENDER_FAILED',
        },
      });
      throw error;
    }
  }
}
