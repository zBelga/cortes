import { createWriteStream } from 'node:fs';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import { MediaKind } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { StoragePort } from '../../../infra/storage/storage.port';
import { StorageKeys } from '../../../infra/storage/storage-keys';
import { FfmpegService } from '../../../infra/media/ffmpeg.service';
import { TempWorkspace } from '../../../infra/media/temp-workspace';
import { FatalJobError } from '../../../common/errors/job-error';
import { MarketingCopyService } from '../../intelligence/marketing/marketing-copy.service';
import { PipelineProgressService } from '../pipeline-progress.service';
import type { PipelineJobData } from '../../queue/queue.service';

/** Previews rodam em paralelo, mas com teto: FFmpeg satura CPU rápido. */
const PREVIEW_CONCURRENCY = 3;

/**
 * Job 4 — FINALIZE.
 *
 * Gera preview e thumbnail de cada corte e escreve a copy de publicação.
 * Os previews usam `-c copy` (sem reencode): são ~50x mais rápidos e servem
 * para revisão. O reencode de qualidade acontece só na exportação, do corte
 * que o usuário realmente escolheu — não dos 20 que ele vai descartar.
 */
@Injectable()
export class FinalizeStage {
  private readonly logger = new Logger(FinalizeStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StoragePort,
    private readonly ffmpeg: FfmpegService,
    private readonly marketing: MarketingCopyService,
    private readonly progress: PipelineProgressService,
  ) {}

  async execute(data: PipelineJobData): Promise<number> {
    const { projectId, userId } = data;

    const [clips, source, transcript] = await Promise.all([
      this.prisma.clip.findMany({
        where: { projectId, deletedAt: null },
        orderBy: { score: 'desc' },
        select: { id: true, startMs: true, endMs: true, durationMs: true, category: true },
      }),
      this.prisma.mediaAsset.findFirst({
        where: { projectId, kind: MediaKind.SOURCE_VIDEO },
        select: { storageKey: true },
      }),
      this.prisma.transcript.findUnique({
        where: { projectId },
        select: {
          language: true,
          segments: { orderBy: { index: 'asc' }, select: { startMs: true, endMs: true, text: true } },
        },
      }),
    ]);

    if (!source) throw new FatalJobError('Vídeo fonte não encontrado', 'SOURCE_MISSING');

    await TempWorkspace.withWorkspace(`finalize-${projectId}`, async (ws) => {
      // ── 12. render-previews ────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'render-previews');

      const localVideo = ws.path('source.mp4');
      await streamPipeline(await this.storage.getStream(source.storageKey), createWriteStream(localVideo));

      let done = 0;
      await this.inBatches(clips, PREVIEW_CONCURRENCY, async (clip) => {
        const previewPath = ws.path(`${clip.id}.mp4`);
        const thumbPath = ws.path(`${clip.id}.jpg`);

        await this.ffmpeg.cut(localVideo, previewPath, {
          startMs: clip.startMs,
          endMs: clip.endMs,
          streamCopy: true,
        });
        // Thumbnail do meio do corte: o primeiro frame costuma ser transição.
        await this.ffmpeg.thumbnail(localVideo, thumbPath, clip.startMs + clip.durationMs / 2);

        const previewKey = StorageKeys.clipPreview(userId, projectId, clip.id);
        const thumbKey = StorageKeys.clipThumbnail(userId, projectId, clip.id);

        await Promise.all([
          this.storage.putFile(previewKey, previewPath, 'video/mp4'),
          this.storage.putFile(thumbKey, thumbPath, 'image/jpeg'),
        ]);

        await this.prisma.clip.update({
          where: { id: clip.id },
          data: { previewKey, thumbnailKey: thumbKey },
        });

        done += 1;
        await this.progress.progressStage(projectId, 'render-previews', done / clips.length);
      });

      await this.progress.completeStage(projectId, 'render-previews', `${clips.length} previews prontos`);

      // ── 13. generate-marketing ─────────────────────────────────────────────
      await this.progress.startStage(projectId, 'generate-marketing');

      let processed = 0;
      // Sequencial: o rate limit do provider é o gargalo, não a CPU.
      for (const clip of clips) {
        const text = (transcript?.segments ?? [])
          .filter((s) => s.endMs > clip.startMs && s.startMs < clip.endMs)
          .map((s) => s.text)
          .join(' ');

        if (text.trim().length > 40) {
          const { copy } = await this.marketing.generate({
            transcript: text,
            category: clip.category,
            durationMs: clip.durationMs,
            language: transcript?.language ?? 'pt',
          });

          if (copy.titles.length) {
            await this.prisma.clip.update({
              where: { id: clip.id },
              data: {
                title: copy.titles[0]!,
                altTitles: copy.titles.slice(1),
                description: copy.description,
                hashtags: copy.hashtags,
                cta: copy.cta,
              },
            });
          }
        }
        processed += 1;
        await this.progress.progressStage(projectId, 'generate-marketing', processed / clips.length);
      }

      await this.progress.completeStage(projectId, 'generate-marketing');
    });

    return clips.length;
  }

  /** Pool de concorrência simples — evita subir 20 FFmpegs de uma vez. */
  private async inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
    for (let i = 0; i < items.length; i += size) {
      await Promise.all(items.slice(i, i + size).map(fn));
    }
  }
}
