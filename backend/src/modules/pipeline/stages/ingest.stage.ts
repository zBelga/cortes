import { promises as fs } from 'node:fs';
import { Injectable, Logger } from '@nestjs/common';
import { AnalysisKind, MediaKind, ProjectSource } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { StoragePort } from '../../../infra/storage/storage.port';
import { StorageKeys } from '../../../infra/storage/storage-keys';
import { FfmpegService } from '../../../infra/media/ffmpeg.service';
import { FfprobeService } from '../../../infra/media/ffprobe.service';
import { YtdlpService } from '../../../infra/media/ytdlp.service';
import { TempWorkspace } from '../../../infra/media/temp-workspace';
import { FatalJobError } from '../../../common/errors/job-error';
import { AudioAnalysisService } from '../../intelligence/analysis/audio-analysis.service';
import { VisualAnalysisService } from '../../intelligence/analysis/visual-analysis.service';
import { PipelineProgressService } from '../pipeline-progress.service';
import type { PipelineJobData } from '../../queue/queue.service';

/** Retenção da mídia fonte — controla o custo de storage (risco #6). */
const SOURCE_TTL_DAYS = 7;

/**
 * Job 1 — INGEST.
 *
 * Roda seis etapas dentro de **um único** diretório temporário. O arquivo de
 * vídeo é baixado uma vez e reaproveitado por probe, extração de áudio,
 * waveform e análises de áudio e vídeo. Separar isso em seis jobs custaria
 * cinco downloads a mais por projeto.
 */
@Injectable()
export class IngestStage {
  private readonly logger = new Logger(IngestStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StoragePort,
    private readonly ffmpeg: FfmpegService,
    private readonly ffprobe: FfprobeService,
    private readonly ytdlp: YtdlpService,
    private readonly audioAnalysis: AudioAnalysisService,
    private readonly visualAnalysis: VisualAnalysisService,
    private readonly progress: PipelineProgressService,
  ) {}

  async execute(data: PipelineJobData): Promise<void> {
    const { projectId, userId } = data;

    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      select: { id: true, source: true, sourceUrl: true, title: true, media: { select: { kind: true, storageKey: true } } },
    });

    await TempWorkspace.withWorkspace(`ingest-${projectId}`, async (ws) => {
      // ── 1. download ────────────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'download');
      const localVideo = await this.acquireSource(project, ws);
      await this.progress.completeStage(projectId, 'download');

      // ── 2. probe ───────────────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'probe');
      const probe = await this.ffprobe.probe(localVideo);
      if (!probe.hasAudio) {
        throw new FatalJobError(
          'Vídeo sem faixa de áudio',
          'NO_AUDIO',
          'O ClipForge precisa de áudio para encontrar os melhores momentos.',
        );
      }
      await this.persistSourceAsset(project.id, userId, localVideo, probe);
      await this.progress.completeStage(
        projectId,
        'probe',
        `${probe.width}×${probe.height} · ${probe.fps ?? '?'} fps`,
      );

      // ── 3. extract-audio ───────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'extract-audio');
      const audioPath = ws.path('audio.wav');
      await this.ffmpeg.extractAudio(localVideo, audioPath, probe.durationMs, (ratio) =>
        void this.progress.progressStage(projectId, 'extract-audio', ratio),
      );
      const audioKey = StorageKeys.audio(userId, projectId);
      const audioUpload = await this.storage.putFile(audioKey, audioPath, 'audio/wav');
      await this.upsertAsset(projectId, MediaKind.AUDIO_WAV, audioKey, 'audio/wav', audioUpload.size, {
        durationMs: probe.durationMs,
      });
      await this.progress.completeStage(projectId, 'extract-audio');

      // ── 4. waveform ────────────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'waveform');
      const peaks = await this.ffmpeg.extractWaveform(audioPath, 2000);
      const waveformKey = StorageKeys.waveform(userId, projectId);
      const waveformBody = Buffer.from(JSON.stringify({ peaks, durationMs: probe.durationMs }));
      await this.storage.putObject(waveformKey, waveformBody, 'application/json');
      await this.upsertAsset(
        projectId,
        MediaKind.WAVEFORM,
        waveformKey,
        'application/json',
        waveformBody.byteLength,
        {},
      );
      await this.progress.completeStage(projectId, 'waveform');

      // ── 5. analyze-audio ───────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'analyze-audio');
      const audio = await this.audioAnalysis.analyze(audioPath, probe.durationMs);
      await this.saveAnalysis(projectId, AnalysisKind.AUDIO, 'ffmpeg-dsp', audio);
      await this.progress.completeStage(
        projectId,
        'analyze-audio',
        `${audio.bursts.length} picos de reação detectados`,
      );

      // ── 6. analyze-visual ──────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'analyze-visual');
      const visual = await this.visualAnalysis.analyze(localVideo, probe.durationMs);
      await this.saveAnalysis(projectId, AnalysisKind.VISUAL, 'ffmpeg-scene', visual);
      await this.progress.completeStage(
        projectId,
        'analyze-visual',
        `${visual.sceneChanges.length} trocas de cena`,
      );
    });
  }

  /** Upload já está no storage; YouTube/Twitch precisam de download. */
  private async acquireSource(
    project: { id: string; source: ProjectSource; sourceUrl: string | null; media: { kind: MediaKind; storageKey: string }[] },
    ws: TempWorkspace,
  ): Promise<string> {
    if (project.source === ProjectSource.UPLOAD) {
      const asset = project.media.find((m) => m.kind === MediaKind.SOURCE_VIDEO);
      if (!asset) {
        throw new FatalJobError('Arquivo enviado não encontrado', 'UPLOAD_MISSING', 'Reenvie o vídeo.');
      }
      const target = ws.path('source.mp4');
      const stream = await this.storage.getStream(asset.storageKey);
      const { createWriteStream } = await import('node:fs');
      const { pipeline } = await import('node:stream/promises');
      await pipeline(stream, createWriteStream(target));
      return target;
    }

    if (!project.sourceUrl) {
      throw new FatalJobError('Projeto sem URL de origem', 'MISSING_SOURCE_URL');
    }

    const result = await this.ytdlp.download(project.sourceUrl, ws.path('source.%(ext)s'), (ratio) =>
      void this.progress.progressStage(project.id, 'download', ratio),
    );

    // O título real do vídeo só é conhecido depois do download.
    await this.prisma.project.update({
      where: { id: project.id },
      data: { title: result.title, externalId: result.externalId },
    });

    return result.filePath;
  }

  private async persistSourceAsset(
    projectId: string,
    userId: string,
    localPath: string,
    probe: Awaited<ReturnType<FfprobeService['probe']>>,
  ): Promise<void> {
    const key = StorageKeys.sourceVideo(userId, projectId, 'mp4');
    const existing = await this.prisma.mediaAsset.findUnique({ where: { storageKey: key } });
    if (!existing) await this.storage.putFile(key, localPath, 'video/mp4');

    const { size } = await fs.stat(localPath);
    await this.upsertAsset(projectId, MediaKind.SOURCE_VIDEO, key, 'video/mp4', size, {
      durationMs: probe.durationMs,
      width: probe.width,
      height: probe.height,
      fps: probe.fps,
      videoCodec: probe.videoCodec,
      audioCodec: probe.audioCodec,
      bitrate: probe.bitrate,
      probe: probe.raw,
      expiresAt: new Date(Date.now() + SOURCE_TTL_DAYS * 86_400_000),
    });
  }

  private async upsertAsset(
    projectId: string,
    kind: MediaKind,
    storageKey: string,
    mimeType: string,
    sizeBytes: number,
    extra: Record<string, unknown>,
  ): Promise<void> {
    // upsert por chave natural: reprocessar não cria linhas órfãs.
    await this.prisma.mediaAsset.upsert({
      where: { storageKey },
      update: { sizeBytes: BigInt(sizeBytes), ...extra } as never,
      create: {
        projectId,
        kind,
        storageKey,
        mimeType,
        sizeBytes: BigInt(sizeBytes),
        ...extra,
      } as never,
    });
  }

  private async saveAnalysis(
    projectId: string,
    kind: AnalysisKind,
    provider: string,
    payload: unknown,
  ): Promise<void> {
    await this.prisma.analysisResult.upsert({
      where: { projectId_kind_version: { projectId, kind, version: '1' } },
      update: { payload: payload as never, provider },
      create: { projectId, kind, version: '1', provider, payload: payload as never },
    });
  }
}
