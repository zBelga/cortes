import type { AudioAnalysis, SemanticAnalysis, VisualAnalysis } from '../analysis/analysis.types';
import type { TranscriptSegmentDto } from '../transcription/transcription.port';
import type { ScorePointDto, ScoreSignals } from './score.types';
import { clamp } from '../../../common/utils/time';

/**
 * Motor de Score de Viralização.
 *
 * Função **pura**: nenhuma dependência de Nest, Prisma, rede ou relógio.
 * Isso é deliberado — é a peça de maior valor do produto e precisa ser
 * testável em milissegundos e reproduzível bit a bit entre execuções.
 *
 * Versione `SCORE_VERSION` a cada mudança de pesos: sem isso é impossível
 * comparar coortes e saber se o modelo melhorou (risco #4 em docs/08-risks.md).
 */
export const SCORE_VERSION = '1.0.0';

/** Pesos somam 1. Calibrados a partir dos sinais mais correlacionados com retenção. */
export const SIGNAL_WEIGHTS: Readonly<ScoreSignals> = Object.freeze({
  hook: 0.26,
  emotion: 0.22,
  humor: 0.16,
  energy: 0.14,
  novelty: 0.12,
  visual: 0.10,
});

const SAMPLE_RATE_MS = 1000;
/** Meia-vida da influência de um evento pontual, em segundos. */
const BURST_DECAY_S = 4;

export interface ScoreInput {
  durationMs: number;
  audio: AudioAnalysis;
  visual: VisualAnalysis;
  semantic: SemanticAnalysis;
  segments: TranscriptSegmentDto[];
}

export class ViralScoreEngine {
  /** Curva de score amostrada a 1 Hz — alimenta a timeline e a seleção de cortes. */
  static computeCurve(input: ScoreInput): ScorePointDto[] {
    const { durationMs, audio, visual, semantic, segments } = input;
    const points = Math.max(1, Math.floor(durationMs / SAMPLE_RATE_MS));

    const speechDensity = ViralScoreEngine.buildSpeechDensity(segments, points);
    const humorCurve = ViralScoreEngine.buildBurstCurve(audio, points, ['laugh']);
    const impactCurve = ViralScoreEngine.buildBurstCurve(audio, points, ['shout', 'impact']);
    const momentCurves = ViralScoreEngine.buildMomentCurves(semantic, points);

    const curve: ScorePointDto[] = new Array(points);

    for (let i = 0; i < points; i += 1) {
      const signals: ScoreSignals = {
        energy: clamp((audio.energy[i] ?? 0) * 0.7 + (speechDensity[i] ?? 0) * 0.3, 0, 1),
        humor: clamp(humorCurve[i] ?? 0, 0, 1),
        visual: clamp((visual.motion[i] ?? 0) * 0.8 + (impactCurve[i] ?? 0) * 0.2, 0, 1),
        emotion: clamp(momentCurves.emotion[i] ?? 0, 0, 1),
        hook: clamp(momentCurves.hook[i] ?? 0, 0, 1),
        novelty: clamp(momentCurves.novelty[i] ?? 0, 0, 1),
      };

      curve[i] = {
        timeMs: i * SAMPLE_RATE_MS,
        score: ViralScoreEngine.combine(signals),
        ...signals,
      };
    }

    return ViralScoreEngine.smooth(curve, 3);
  }

  /** Soma ponderada → 0..100. */
  static combine(signals: ScoreSignals): number {
    const raw = (Object.keys(SIGNAL_WEIGHTS) as (keyof ScoreSignals)[]).reduce(
      (total, key) => total + signals[key] * SIGNAL_WEIGHTS[key],
      0,
    );
    return Math.round(clamp(raw, 0, 1) * 1000) / 10;
  }

  /**
   * Score de uma janela. Não é a média simples da curva:
   * o início pesa mais porque é onde a retenção é decidida.
   */
  static scoreWindow(curve: ScorePointDto[], startMs: number, endMs: number): {
    score: number;
    signals: ScoreSignals;
  } {
    const slice = curve.filter((p) => p.timeMs >= startMs && p.timeMs < endMs);
    if (!slice.length) {
      return {
        score: 0,
        signals: { emotion: 0, energy: 0, humor: 0, hook: 0, novelty: 0, visual: 0 },
      };
    }

    const signals = ViralScoreEngine.averageSignals(slice);

    // Os 3 primeiros segundos definem se o espectador fica. Peso extra explícito.
    const opening = slice.slice(0, 3);
    const openingStrength = opening.length
      ? opening.reduce((a, p) => a + p.hook * 0.6 + p.energy * 0.4, 0) / opening.length
      : 0;

    // Clímax: um pico forte vale mais que um platô morno de mesma média.
    const peak = Math.max(...slice.map((p) => p.score)) / 100;

    const base = ViralScoreEngine.combine(signals) / 100;
    const composite = base * 0.55 + openingStrength * 0.28 + peak * 0.17;

    return { score: Math.round(clamp(composite, 0, 1) * 1000) / 10, signals };
  }

  // ── construção de curvas auxiliares ──────────────────────────────────────

  /** Palavras por segundo, normalizado — silêncio derruba o sinal de energia. */
  private static buildSpeechDensity(segments: TranscriptSegmentDto[], points: number): number[] {
    const density = new Array<number>(points).fill(0);

    for (const segment of segments) {
      const wordCount = segment.words.length || segment.text.split(/\s+/).length;
      const spanSeconds = Math.max(1, (segment.endMs - segment.startMs) / 1000);
      const wordsPerSecond = wordCount / spanSeconds;

      const from = Math.floor(segment.startMs / SAMPLE_RATE_MS);
      const to = Math.min(points, Math.ceil(segment.endMs / SAMPLE_RATE_MS));
      // ~3.5 palavras/s é fala animada; acima disso satura.
      const value = clamp(wordsPerSecond / 3.5, 0, 1);
      for (let i = Math.max(0, from); i < to; i += 1) density[i] = value;
    }
    return density;
  }

  /** Eventos pontuais viram curva com decaimento exponencial nos dois sentidos. */
  private static buildBurstCurve(
    audio: AudioAnalysis,
    points: number,
    kinds: AudioAnalysis['bursts'][number]['kind'][],
  ): number[] {
    const curve = new Array<number>(points).fill(0);

    for (const burst of audio.bursts) {
      if (!kinds.includes(burst.kind)) continue;
      const center = Math.floor(burst.atMs / SAMPLE_RATE_MS);
      const radius = BURST_DECAY_S * 2;

      for (let offset = -radius; offset <= radius; offset += 1) {
        const index = center + offset;
        if (index < 0 || index >= points) continue;
        const decay = Math.exp(-Math.abs(offset) / BURST_DECAY_S);
        curve[index] = Math.max(curve[index] ?? 0, burst.intensity * decay);
      }
    }
    return curve;
  }

  /** Momentos identificados pelo LLM viram platôs dentro das suas janelas. */
  private static buildMomentCurves(semantic: SemanticAnalysis, points: number) {
    const emotion = new Array<number>(points).fill(0);
    const hook = new Array<number>(points).fill(0);
    const novelty = new Array<number>(points).fill(0);

    for (const moment of semantic.moments) {
      const from = Math.max(0, Math.floor(moment.startMs / SAMPLE_RATE_MS));
      const to = Math.min(points, Math.ceil(moment.endMs / SAMPLE_RATE_MS));

      for (let i = from; i < to; i += 1) {
        emotion[i] = Math.max(emotion[i] ?? 0, moment.emotion);
        novelty[i] = Math.max(novelty[i] ?? 0, moment.novelty);
        // O gancho decai ao longo do momento: ele existe no começo, não no meio.
        const progress = (i - from) / Math.max(1, to - from);
        hook[i] = Math.max(hook[i] ?? 0, moment.hook * Math.exp(-progress * 2));
      }
    }
    return { emotion, hook, novelty };
  }

  private static averageSignals(points: ScorePointDto[]): ScoreSignals {
    const keys: (keyof ScoreSignals)[] = ['emotion', 'energy', 'humor', 'hook', 'novelty', 'visual'];
    const totals = keys.reduce<ScoreSignals>(
      (acc, key) => {
        acc[key] = points.reduce((sum, p) => sum + p[key], 0) / points.length;
        return acc;
      },
      { emotion: 0, energy: 0, humor: 0, hook: 0, novelty: 0, visual: 0 },
    );
    return totals;
  }

  /** Média móvel: remove ruído de 1 s que não representa mudança real de conteúdo. */
  private static smooth(curve: ScorePointDto[], radius: number): ScorePointDto[] {
    return curve.map((point, i) => {
      const window = curve.slice(Math.max(0, i - radius), i + radius + 1);
      return { ...point, score: Math.round((window.reduce((a, p) => a + p.score, 0) / window.length) * 10) / 10 };
    });
  }
}
