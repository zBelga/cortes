import type { AudioAnalysis, SemanticAnalysis } from '../analysis/analysis.types';
import type { TranscriptSegmentDto } from '../transcription/transcription.port';
import type { ClipCandidate, ScorePointDto } from './score.types';
import { ViralScoreEngine } from './viral-score.engine';

export interface SelectionOptions {
  minScore: number;
  maxClips: number;
  minDurationMs: number;
  maxDurationMs: number;
  /** Sobreposição máxima tolerada entre dois cortes (0..1). */
  maxOverlap: number;
}

export const DEFAULT_SELECTION: SelectionOptions = {
  minScore: 60,
  maxClips: 20,
  minDurationMs: 15_000,
  maxDurationMs: 90_000,
  maxOverlap: 0.25,
};

export interface SelectionInput {
  curve: ScorePointDto[];
  semantic: SemanticAnalysis;
  audio: AudioAnalysis;
  segments: TranscriptSegmentDto[];
  sceneChanges: number[];
  options?: Partial<SelectionOptions>;
}

/**
 * Seleção de cortes. Função pura, testável isoladamente.
 *
 * Estratégia em três passos:
 *  1. Gera candidatos a partir dos momentos do LLM **e** de picos da curva
 *     (o LLM não vê áudio; a curva não entende contexto — juntos cobrem mais).
 *  2. Ajusta as bordas para fronteiras naturais: fim de frase, troca de cena, silêncio.
 *  3. Suprime não-máximos: mantém o melhor de cada região, evitando 5 cortes do
 *     mesmo trecho com 2 s de diferença.
 */
export class ClipSelector {
  static select(input: SelectionInput): ClipCandidate[] {
    const options = { ...DEFAULT_SELECTION, ...input.options };
    const candidates = [
      ...ClipSelector.fromMoments(input, options),
      ...ClipSelector.fromPeaks(input, options),
    ];

    const snapped = candidates
      .map((candidate) => ClipSelector.snapToBoundaries(candidate, input, options))
      .filter((candidate) => {
        const duration = candidate.endMs - candidate.startMs;
        return duration >= options.minDurationMs && duration <= options.maxDurationMs;
      })
      .map((candidate) => {
        const { score, signals } = ViralScoreEngine.scoreWindow(
          input.curve,
          candidate.startMs,
          candidate.endMs,
        );
        return { ...candidate, score, signals, durationMs: candidate.endMs - candidate.startMs };
      })
      .filter((candidate) => candidate.score >= options.minScore)
      .sort((a, b) => b.score - a.score);

    return ClipSelector.suppressOverlaps(snapped, options).slice(0, options.maxClips);
  }

  /** Candidatos vindos da análise semântica — já trazem título e categoria. */
  private static fromMoments(input: SelectionInput, options: SelectionOptions): ClipCandidate[] {
    return input.semantic.moments.map((moment) => ({
      startMs: moment.startMs,
      endMs: Math.min(moment.endMs, moment.startMs + options.maxDurationMs),
      durationMs: moment.endMs - moment.startMs,
      score: 0,
      signals: { emotion: 0, energy: 0, humor: 0, hook: 0, novelty: 0, visual: 0 },
      category: moment.category,
      title: moment.title,
      reason: moment.reason,
    }));
  }

  /**
   * Candidatos vindos de picos da curva. Captura o que o LLM não vê:
   * a risada da plateia, o grito na vitória, a explosão — momentos onde o
   * texto é irrelevante mas o áudio conta a história inteira.
   */
  private static fromPeaks(input: SelectionInput, options: SelectionOptions): ClipCandidate[] {
    const { curve } = input;
    if (curve.length < 10) return [];

    const mean = curve.reduce((a, p) => a + p.score, 0) / curve.length;
    const threshold = Math.max(mean * 1.35, options.minScore);
    const targetMs = 40_000;
    const candidates: ClipCandidate[] = [];

    for (let i = 1; i < curve.length - 1; i += 1) {
      const point = curve[i]!;
      const isLocalMax = point.score > (curve[i - 1]?.score ?? 0) && point.score >= (curve[i + 1]?.score ?? 0);
      if (!isLocalMax || point.score < threshold) continue;

      // Centraliza a janela um pouco antes do pico: o gancho precisa vir primeiro.
      const startMs = Math.max(0, point.timeMs - targetMs * 0.35);
      candidates.push({
        startMs,
        endMs: startMs + targetMs,
        durationMs: targetMs,
        score: 0,
        signals: { emotion: 0, energy: 0, humor: 0, hook: 0, novelty: 0, visual: 0 },
        category: point.humor > 0.5 ? 'FUNNY' : point.visual > 0.5 ? 'GAMEPLAY' : 'OTHER',
        title: 'Momento de destaque',
        reason: 'Pico de energia e reação detectado no áudio.',
      });
      i += 10; // evita gerar um candidato por segundo dentro do mesmo pico
    }
    return candidates;
  }

  /**
   * Ajuste de bordas. Cortar no meio de uma palavra é o defeito mais visível
   * de um gerador de cortes — aqui ele é eliminado por construção.
   */
  private static snapToBoundaries(
    candidate: ClipCandidate,
    input: SelectionInput,
    options: SelectionOptions,
  ): ClipCandidate {
    const TOLERANCE_MS = 2_500;

    const sentenceStarts = input.segments.map((s) => s.startMs);
    const sentenceEnds = input.segments.map((s) => s.endMs);
    const silenceEdges = input.audio.silences.flatMap((s) => [s.endMs, s.startMs]);

    const startMs = nearest(candidate.startMs, [...sentenceStarts, ...input.sceneChanges, ...silenceEdges], TOLERANCE_MS);
    const endMs = nearest(candidate.endMs, [...sentenceEnds, ...input.sceneChanges, ...silenceEdges], TOLERANCE_MS);

    const safeStart = Math.max(0, startMs);
    const safeEnd = Math.max(safeStart + options.minDurationMs, endMs);

    return { ...candidate, startMs: safeStart, endMs: safeEnd };
  }

  /** Non-maximum suppression clássico, adaptado a intervalos de tempo. */
  private static suppressOverlaps(
    candidates: ClipCandidate[],
    options: SelectionOptions,
  ): ClipCandidate[] {
    const kept: ClipCandidate[] = [];

    for (const candidate of candidates) {
      const conflicts = kept.some((existing) => {
        const overlap =
          Math.min(existing.endMs, candidate.endMs) - Math.max(existing.startMs, candidate.startMs);
        if (overlap <= 0) return false;
        const shorter = Math.min(
          existing.endMs - existing.startMs,
          candidate.endMs - candidate.startMs,
        );
        return overlap / shorter > options.maxOverlap;
      });
      if (!conflicts) kept.push(candidate);
    }
    return kept;
  }
}

/** Ponto mais próximo dentro da tolerância; o valor original se nada estiver perto. */
function nearest(value: number, points: number[], toleranceMs: number): number {
  let best = value;
  let bestDistance = toleranceMs;

  for (const point of points) {
    const distance = Math.abs(point - value);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }
  return best;
}
