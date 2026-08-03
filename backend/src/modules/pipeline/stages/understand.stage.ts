import { createWriteStream } from 'node:fs';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import { AnalysisKind, MediaKind } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { StoragePort } from '../../../infra/storage/storage.port';
import { TempWorkspace } from '../../../infra/media/temp-workspace';
import { FatalJobError } from '../../../common/errors/job-error';
import { TranscriptionPort } from '../../intelligence/transcription/transcription.port';
import { SemanticAnalysisService } from '../../intelligence/analysis/semantic-analysis.service';
import { PipelineProgressService } from '../pipeline-progress.service';
import type { PipelineJobData } from '../../queue/queue.service';

/**
 * Job 2 — UNDERSTAND.
 *
 * Baixa apenas o WAV (≈1/50 do tamanho do vídeo), transcreve e extrai
 * momentos com o LLM. Fica na fila `ai`, que tem concorrência alta por ser
 * I/O bound — ao contrário da fila `media`, limitada por núcleos de CPU.
 */
@Injectable()
export class UnderstandStage {
  private readonly logger = new Logger(UnderstandStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StoragePort,
    private readonly transcription: TranscriptionPort,
    private readonly semantics: SemanticAnalysisService,
    private readonly progress: PipelineProgressService,
  ) {}

  async execute(data: PipelineJobData): Promise<void> {
    const { projectId } = data;

    const audioAsset = await this.prisma.mediaAsset.findFirst({
      where: { projectId, kind: MediaKind.AUDIO_WAV },
      select: { storageKey: true, durationMs: true },
    });
    if (!audioAsset) {
      throw new FatalJobError('Áudio não encontrado', 'AUDIO_MISSING', 'Reprocesse o projeto.');
    }

    await TempWorkspace.withWorkspace(`understand-${projectId}`, async (ws) => {
      const audioPath = ws.path('audio.wav');
      await streamPipeline(await this.storage.getStream(audioAsset.storageKey), createWriteStream(audioPath));

      // ── 7. transcribe ──────────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'transcribe', `Motor: ${this.transcription.name}`);
      const result = await this.transcription.transcribe({
        audioPath,
        durationMs: audioAsset.durationMs ?? 0,
        onProgress: (ratio) => void this.progress.progressStage(projectId, 'transcribe', ratio),
      });

      if (!result.segments.length) {
        throw new FatalJobError(
          'Transcrição vazia',
          'EMPTY_TRANSCRIPT',
          'Não encontramos fala neste vídeo. Vídeos sem narração ainda não são suportados.',
        );
      }

      // Uma transação: transcript e segmentos entram juntos ou não entram.
      await this.prisma.$transaction([
        this.prisma.transcript.deleteMany({ where: { projectId } }),
        this.prisma.transcript.create({
          data: {
            projectId,
            provider: result.provider,
            model: result.model,
            language: result.language,
            confidence: result.confidence,
            text: result.text,
            durationMs: result.durationMs,
            wordCount: result.segments.reduce((sum, s) => sum + s.words.length, 0),
            costCents: result.costCents,
            segments: {
              // createMany aninhado: um único INSERT para milhares de segmentos.
              createMany: {
                data: result.segments.map((segment) => ({
                  index: segment.index,
                  startMs: segment.startMs,
                  endMs: segment.endMs,
                  text: segment.text,
                  confidence: segment.confidence,
                  speaker: segment.speaker ?? null,
                  words: segment.words as never,
                })),
              },
            },
          },
        }),
      ]);
      await this.progress.completeStage(
        projectId,
        'transcribe',
        `${result.segments.length} trechos · ${result.text.split(/\s+/).length} palavras`,
      );

      // ── 8. detect-language ─────────────────────────────────────────────────
      await this.progress.startStage(projectId, 'detect-language');
      await this.progress.completeStage(
        projectId,
        'detect-language',
        `${result.language} (${Math.round(result.confidence * 100)}% de confiança)`,
      );

      // ── 9. analyze-semantics ───────────────────────────────────────────────
      await this.progress.startStage(projectId, 'analyze-semantics');
      const { analysis, costCents } = await this.semantics.analyze(
        result.segments,
        result.language,
        (ratio) => void this.progress.progressStage(projectId, 'analyze-semantics', ratio),
      );

      await this.prisma.analysisResult.upsert({
        where: { projectId_kind_version: { projectId, kind: AnalysisKind.SEMANTIC, version: '1' } },
        update: { payload: analysis as never, costCents },
        create: {
          projectId,
          kind: AnalysisKind.SEMANTIC,
          version: '1',
          provider: 'llm',
          payload: analysis as never,
          costCents,
        },
      });

      await this.prisma.pipelineRun.update({
        where: { projectId },
        data: { aiCostCents: { increment: result.costCents + costCents } },
      });

      await this.progress.completeStage(
        projectId,
        'analyze-semantics',
        `${analysis.moments.length} momentos candidatos`,
      );
    });
  }
}
