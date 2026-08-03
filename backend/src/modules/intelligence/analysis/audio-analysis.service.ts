import { Injectable } from '@nestjs/common';
import { FfmpegService } from '../../../infra/media/ffmpeg.service';
import type { AudioAnalysis } from './analysis.types';

const SAMPLE_RATE_MS = 1000;
/** Um burst é um salto acima da média + N desvios — normalizado por vídeo. */
const BURST_SIGMA = 1.8;

/**
 * Análise de áudio determinística e barata: roda em CPU, sem chamada de IA.
 * Fornece energia, silêncios e picos (risada/grito/impacto).
 *
 * A normalização é **relativa ao próprio vídeo**: um podcast sussurrado e um
 * gameplay gritado precisam produzir curvas comparáveis.
 */
@Injectable()
export class AudioAnalysisService {
  constructor(private readonly ffmpeg: FfmpegService) {}

  async analyze(audioPath: string, durationMs: number): Promise<AudioAnalysis> {
    const sampleCount = Math.max(1, Math.floor(durationMs / SAMPLE_RATE_MS));

    const [peaks, silences] = await Promise.all([
      this.ffmpeg.extractWaveform(audioPath, sampleCount),
      this.ffmpeg.detectSilence(audioPath),
    ]);

    const { mean, stdDev } = baseline(peaks);
    const max = Math.max(...peaks, 1e-6);
    const energy = peaks.map((p) => Math.min(1, p / max));

    const bursts: AudioAnalysis['bursts'] = [];
    const threshold = mean + BURST_SIGMA * stdDev;

    for (let i = 1; i < peaks.length - 1; i += 1) {
      const current = peaks[i]!;
      const previous = peaks[i - 1]!;
      if (current <= threshold || current <= previous) continue;

      // Sustentação após o pico separa risada (dura) de impacto (some rápido).
      const sustain = average(peaks.slice(i, i + 3));
      const attack = current - previous;

      bursts.push({
        atMs: i * SAMPLE_RATE_MS,
        intensity: Math.min(1, (current - mean) / (stdDev * 4 || 1)),
        kind: sustain > mean + stdDev ? (attack > stdDev * 2 ? 'shout' : 'laugh') : 'impact',
      });
      i += 1; // evita contar o mesmo evento duas vezes
    }

    return { energy, bursts, silences, baseline: { mean, stdDev }, sampleRateMs: SAMPLE_RATE_MS };
  }
}

function average(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function baseline(values: number[]): { mean: number; stdDev: number } {
  const mean = average(values);
  const variance = average(values.map((v) => (v - mean) ** 2));
  return { mean, stdDev: Math.sqrt(variance) };
}
