import { Injectable } from '@nestjs/common';
import { FfmpegService } from '../../../infra/media/ffmpeg.service';
import type { VisualAnalysis } from './analysis.types';

const SAMPLE_RATE_MS = 1000;
/** Acima disso, mais cortes por segundo não indicam mais "ação". */
const MOTION_SATURATION = 3;

/**
 * Sinal visual barato: densidade de troca de cena.
 * É um proxy sólido para ritmo — clipes de alta retenção quase sempre têm
 * densidade de corte acima da média do vídeo de origem.
 *
 * Detecção facial e OCR de HUD entram na fase 2 (ver docs/09-roadmap.md);
 * a interface já acomoda esses campos sem quebrar consumidores.
 */
@Injectable()
export class VisualAnalysisService {
  constructor(private readonly ffmpeg: FfmpegService) {}

  async analyze(videoPath: string, durationMs: number): Promise<VisualAnalysis> {
    const sceneChanges = await this.ffmpeg.detectScenes(videoPath);
    const buckets = Math.max(1, Math.floor(durationMs / SAMPLE_RATE_MS));
    const motion = new Array<number>(buckets).fill(0);

    for (const timestamp of sceneChanges) {
      const index = Math.floor(timestamp / SAMPLE_RATE_MS);
      if (index >= 0 && index < buckets) motion[index] = (motion[index] ?? 0) + 1;
    }

    // Janela deslizante de 5 s: um corte isolado não é "ação", uma sequência é.
    const smoothed = motion.map((_, i) => {
      const window = motion.slice(Math.max(0, i - 2), i + 3);
      const sum = window.reduce((a, b) => a + b, 0);
      return Math.min(1, sum / MOTION_SATURATION);
    });

    return { sceneChanges, motion: smoothed, sampleRateMs: SAMPLE_RATE_MS };
  }
}
