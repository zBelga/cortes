import { Injectable, Logger } from '@nestjs/common';
import { AnalysisKind, type ClipCategory } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { FatalJobError } from '../../../common/errors/job-error';
import {
  audioAnalysisSchema,
  semanticAnalysisSchema,
  visualAnalysisSchema,
} from '../../intelligence/analysis/analysis.types';
import { ViralScoreEngine } from '../../intelligence/scoring/viral-score.engine';
import { ClipSelector, DEFAULT_SELECTION } from '../../intelligence/scoring/clip-selector';
import { PipelineProgressService } from '../pipeline-progress.service';
import type { PipelineJobData } from '../../queue/queue.service';

const preferencesShape = {
  minScore: DEFAULT_SELECTION.minScore,
  maxClips: DEFAULT_SELECTION.maxClips,
  minDurationMs: DEFAULT_SELECTION.minDurationMs,
  maxDurationMs: DEFAULT_SELECTION.maxDurationMs,
};

/**
 * Job 3 — COMPOSE.
 *
 * Puro cálculo: lê análises do banco, roda o motor de score e a seleção de
 * janelas, grava a curva e os cortes. Sem rede, sem disco, sem IA — por isso
 * é o job mais rápido e o mais fácil de testar.
 */
@Injectable()
export class ComposeStage {
  private readonly logger = new Logger(ComposeStage.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: PipelineProgressService,
  ) {}

  async execute(data: PipelineJobData): Promise<void> {
    const { projectId } = data;

    // ── 10. score ────────────────────────────────────────────────────────────
    await this.progress.startStage(projectId, 'score');

    const [project, analyses, transcript] = await Promise.all([
      this.prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { preferences: true, media: { select: { durationMs: true, kind: true } } },
      }),
      this.prisma.analysisResult.findMany({
        where: { projectId, version: '1' },
        select: { kind: true, payload: true },
      }),
      this.prisma.transcript.findUnique({
        where: { projectId },
        select: {
          durationMs: true,
          segments: {
            orderBy: { index: 'asc' },
            select: { index: true, startMs: true, endMs: true, text: true, confidence: true, words: true },
          },
        },
      }),
    ]);

    if (!transcript) throw new FatalJobError('Transcrição ausente', 'TRANSCRIPT_MISSING');

    const audio = audioAnalysisSchema.parse(
      analyses.find((a) => a.kind === AnalysisKind.AUDIO)?.payload,
    );
    const visual = visualAnalysisSchema.parse(
      analyses.find((a) => a.kind === AnalysisKind.VISUAL)?.payload,
    );
    const semantic = semanticAnalysisSchema.parse(
      analyses.find((a) => a.kind === AnalysisKind.SEMANTIC)?.payload ?? { topics: [], moments: [] },
    );

    const segments = transcript.segments.map((s) => ({
      index: s.index,
      startMs: s.startMs,
      endMs: s.endMs,
      text: s.text,
      confidence: s.confidence,
      words: (s.words as { w: string; s: number; e: number; c: number }[]) ?? [],
    }));

    const durationMs = transcript.durationMs;
    const curve = ViralScoreEngine.computeCurve({ durationMs, audio, visual, semantic, segments });

    await this.prisma.$transaction([
      this.prisma.scorePoint.deleteMany({ where: { projectId } }),
      this.prisma.scorePoint.createMany({
        data: curve.map((point) => ({
          projectId,
          timeMs: point.timeMs,
          score: point.score,
          emotion: point.emotion,
          energy: point.energy,
          humor: point.humor,
          hook: point.hook,
          novelty: point.novelty,
          visual: point.visual,
        })),
      }),
    ]);
    await this.progress.completeStage(projectId, 'score', `${curve.length} pontos analisados`);

    // ── 11. select-clips ─────────────────────────────────────────────────────
    await this.progress.startStage(projectId, 'select-clips');

    const preferences = { ...preferencesShape, ...(project.preferences as Record<string, number>) };
    const candidates = ClipSelector.select({
      curve,
      semantic,
      audio,
      segments,
      sceneChanges: visual.sceneChanges,
      options: preferences,
    });

    if (!candidates.length) {
      throw new FatalJobError(
        'Nenhum trecho atingiu a nota mínima',
        'NO_CLIPS_FOUND',
        `Nenhum momento passou de ${preferences.minScore} pontos. Tente reduzir a nota mínima nas preferências do projeto.`,
      );
    }

    const scores = candidates.map((c) => c.score);
    const totalClipMs = candidates.reduce((sum, c) => sum + c.durationMs, 0);

    await this.prisma.$transaction([
      this.prisma.clip.deleteMany({ where: { projectId } }),
      this.prisma.clip.createMany({
        data: candidates.map((candidate) => ({
          projectId,
          startMs: candidate.startMs,
          endMs: candidate.endMs,
          durationMs: candidate.durationMs,
          title: candidate.title,
          category: candidate.category as ClipCategory,
          score: candidate.score,
          reason: candidate.reason,
          scoreBreakdown: candidate.signals as never,
        })),
      }),
      this.prisma.project.update({
        where: { id: projectId },
        data: {
          clipCount: candidates.length,
          averageScore: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
          bestScore: Math.max(...scores),
          // Tempo economizado: revisar o vídeo inteiro à mão vs. receber os cortes prontos.
          secondsSaved: Math.round((durationMs - totalClipMs) / 1000),
        },
      }),
    ]);

    await this.progress.completeStage(
      projectId,
      'select-clips',
      `${candidates.length} cortes · melhor nota ${Math.max(...scores).toFixed(1)}`,
    );
  }
}
