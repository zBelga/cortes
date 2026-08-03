import { describe, expect, it } from 'vitest';
import { ViralScoreEngine, SIGNAL_WEIGHTS } from './viral-score.engine';
import type { AudioAnalysis, SemanticAnalysis, VisualAnalysis } from '../analysis/analysis.types';
import type { TranscriptSegmentDto } from '../transcription/transcription.port';

const emptyAudio = (points: number): AudioAnalysis => ({
  energy: new Array(points).fill(0),
  bursts: [],
  silences: [],
  baseline: { mean: 0, stdDev: 0 },
  sampleRateMs: 1000,
});

const emptyVisual = (points: number): VisualAnalysis => ({
  sceneChanges: [],
  motion: new Array(points).fill(0),
  sampleRateMs: 1000,
});

const emptySemantic: SemanticAnalysis = { topics: [], moments: [] };

describe('ViralScoreEngine', () => {
  it('mantém a soma dos pesos em 1', () => {
    const total = Object.values(SIGNAL_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('devolve 0 quando não há nenhum sinal', () => {
    const curve = ViralScoreEngine.computeCurve({
      durationMs: 10_000,
      audio: emptyAudio(10),
      visual: emptyVisual(10),
      semantic: emptySemantic,
      segments: [],
    });
    expect(curve).toHaveLength(10);
    expect(curve.every((p) => p.score === 0)).toBe(true);
  });

  it('atinge 100 quando todos os sinais estão saturados', () => {
    expect(
      ViralScoreEngine.combine({ emotion: 1, energy: 1, humor: 1, hook: 1, novelty: 1, visual: 1 }),
    ).toBe(100);
  });

  it('faz uma risada elevar o score ao redor do evento', () => {
    const audio = emptyAudio(60);
    audio.energy = audio.energy.map(() => 0.3);
    audio.bursts = [{ atMs: 30_000, intensity: 1, kind: 'laugh' }];

    const curve = ViralScoreEngine.computeCurve({
      durationMs: 60_000,
      audio,
      visual: emptyVisual(60),
      semantic: emptySemantic,
      segments: [],
    });

    const atLaugh = curve.find((p) => p.timeMs === 30_000)!;
    const faraway = curve.find((p) => p.timeMs === 5_000)!;
    expect(atLaugh.score).toBeGreaterThan(faraway.score);
  });

  it('pontua a janela acima da média quando o gancho está no início', () => {
    const segments: TranscriptSegmentDto[] = [
      { index: 0, startMs: 0, endMs: 30_000, text: 'a b c d e f', confidence: 1, words: [] },
    ];
    const semantic: SemanticAnalysis = {
      topics: [],
      moments: [
        {
          startMs: 0,
          endMs: 30_000,
          category: 'STORY',
          hook: 1,
          emotion: 0.8,
          standalone: 1,
          novelty: 0.7,
          title: 'Teste',
          reason: 'gancho no início',
        },
      ],
    };

    const curve = ViralScoreEngine.computeCurve({
      durationMs: 30_000,
      audio: emptyAudio(30),
      visual: emptyVisual(30),
      semantic,
      segments,
    });

    const window = ViralScoreEngine.scoreWindow(curve, 0, 30_000);
    expect(window.score).toBeGreaterThan(20);
    expect(window.signals.hook).toBeGreaterThan(0);
  });

  it('é determinístico entre execuções', () => {
    const input = {
      durationMs: 20_000,
      audio: { ...emptyAudio(20), bursts: [{ atMs: 8_000, intensity: 0.7, kind: 'laugh' as const }] },
      visual: emptyVisual(20),
      semantic: emptySemantic,
      segments: [],
    };
    expect(ViralScoreEngine.computeCurve(input)).toEqual(ViralScoreEngine.computeCurve(input));
  });
});
