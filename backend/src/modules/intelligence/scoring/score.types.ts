/** Contribuição de cada sinal, normalizada 0..1 — a soma ponderada vira o score. */
export interface ScoreSignals {
  emotion: number;
  energy: number;
  humor: number;
  hook: number;
  novelty: number;
  visual: number;
}

export interface ScorePointDto extends ScoreSignals {
  timeMs: number;
  /** 0..100 */
  score: number;
}

export interface ClipCandidate {
  startMs: number;
  endMs: number;
  durationMs: number;
  /** 0..100 */
  score: number;
  signals: ScoreSignals;
  category: string;
  title: string;
  reason: string;
}
