import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { ProcessRunner } from './process-runner';
import { clamp } from '../../common/utils/time';

export type ProgressCallback = (ratio: number) => void;

export interface CutOptions {
  startMs: number;
  endMs: number;
  /** `true` usa `-c copy` (instantâneo, mas alinha em keyframe). */
  streamCopy?: boolean;
  width?: number;
  height?: number;
  fps?: number;
  crf?: number;
}

@Injectable()
export class FfmpegService {
  private readonly logger = new Logger(FfmpegService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  /**
   * Áudio para transcrição: 16 kHz, mono, PCM.
   * É exatamente o que o Whisper consome — converter aqui evita que o modelo
   * gaste tempo reamostrando e reduz o upload em ~10x.
   */
  async extractAudio(input: string, output: string, durationMs: number, onProgress?: ProgressCallback) {
    await ProcessRunner.run(
      this.env.FFMPEG_PATH,
      ['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', output],
      { onStderrLine: this.progressParser(durationMs, onProgress) },
    );
    return output;
  }

  /** Amostras de volume RMS para desenhar a waveform da timeline. */
  async extractWaveform(input: string, samples = 2000): Promise<number[]> {
    const raw = await ProcessRunner.run(
      this.env.FFMPEG_PATH,
      ['-i', input, '-ac', '1', '-filter:a', 'aresample=8000', '-map', '0:a', '-c:a', 'pcm_s16le', '-f', 'data', '-'],
      { timeoutMs: 10 * 60_000 },
    );

    const buffer = Buffer.from(raw, 'binary');
    const total = Math.floor(buffer.length / 2);
    const bucketSize = Math.max(1, Math.floor(total / samples));
    const peaks: number[] = [];

    for (let i = 0; i < total; i += bucketSize) {
      let sum = 0;
      let count = 0;
      for (let j = i; j < Math.min(i + bucketSize, total); j += 1) {
        const sample = buffer.readInt16LE(j * 2) / 32768;
        sum += sample * sample;
        count += 1;
      }
      peaks.push(count ? Math.sqrt(sum / count) : 0);
    }
    return peaks;
  }

  /**
   * Corta um trecho. `streamCopy` é ~50x mais rápido e não perde qualidade,
   * mas só corta em keyframe — usamos para previews e reencodamos na exportação.
   */
  async cut(input: string, output: string, options: CutOptions, onProgress?: ProgressCallback) {
    const { startMs, endMs, streamCopy = false, width, height, fps, crf = 20 } = options;
    const durationMs = endMs - startMs;

    const args = ['-y', '-ss', (startMs / 1000).toFixed(3), '-i', input, '-t', (durationMs / 1000).toFixed(3)];

    if (streamCopy) {
      args.push('-c', 'copy', '-avoid_negative_ts', 'make_zero');
    } else {
      const filters: string[] = [];
      if (width && height) {
        // Reenquadramento vertical: escala cobrindo e recorta o centro.
        filters.push(
          `scale=${width}:${height}:force_original_aspect_ratio=increase`,
          `crop=${width}:${height}`,
        );
      }
      if (filters.length) args.push('-vf', filters.join(','));
      if (fps) args.push('-r', String(fps));
      args.push(
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', String(clamp(crf, 14, 30)),
        '-profile:v', 'high',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '160k',
        // faststart move o moov atom para o início: o player começa sem baixar tudo.
        '-movflags', '+faststart',
      );
    }

    args.push(output);
    await ProcessRunner.run(this.env.FFMPEG_PATH, args, {
      onStderrLine: this.progressParser(durationMs, onProgress),
    });
    return output;
  }

  async thumbnail(input: string, output: string, atMs: number, width = 720) {
    await ProcessRunner.run(
      this.env.FFMPEG_PATH,
      [
        '-y',
        '-ss', (atMs / 1000).toFixed(3),
        '-i', input,
        '-frames:v', '1',
        '-vf', `scale=${width}:-2`,
        '-q:v', '3',
        output,
      ],
      { timeoutMs: 60_000 },
    );
    return output;
  }

  /**
   * Detecção de cenas via filtro `select`. Devolve os timestamps de troca de cena,
   * usados como fronteiras naturais de corte (nunca cortar no meio de um plano).
   */
  async detectScenes(input: string, threshold = 0.4): Promise<number[]> {
    const timestamps: number[] = [];
    await ProcessRunner.run(
      this.env.FFMPEG_PATH,
      ['-i', input, '-filter:v', `select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-'],
      {
        timeoutMs: 20 * 60_000,
        onStderrLine: (line) => {
          const match = /pts_time:([0-9.]+)/.exec(line);
          if (match?.[1]) timestamps.push(Math.round(Number(match[1]) * 1000));
        },
      },
    );
    return timestamps;
  }

  /**
   * Detecção de silêncio — insumo para remoção automática de pausas
   * e para não cortar no meio de uma frase.
   */
  async detectSilence(input: string, noiseDb = -32, minDurationS = 0.4) {
    const silences: { startMs: number; endMs: number }[] = [];
    let pendingStart: number | null = null;

    await ProcessRunner.run(
      this.env.FFMPEG_PATH,
      ['-i', input, '-af', `silencedetect=noise=${noiseDb}dB:d=${minDurationS}`, '-f', 'null', '-'],
      {
        timeoutMs: 20 * 60_000,
        onStderrLine: (line) => {
          const start = /silence_start: ([0-9.-]+)/.exec(line);
          const end = /silence_end: ([0-9.]+)/.exec(line);
          if (start?.[1]) pendingStart = Math.round(Number(start[1]) * 1000);
          if (end?.[1] && pendingStart !== null) {
            silences.push({ startMs: pendingStart, endMs: Math.round(Number(end[1]) * 1000) });
            pendingStart = null;
          }
        },
      },
    );
    return silences;
  }

  /** Traduz `time=00:01:23.45` do stderr do FFmpeg em progresso 0..1. */
  private progressParser(durationMs: number, onProgress?: ProgressCallback) {
    if (!onProgress || durationMs <= 0) return undefined;
    let last = 0;

    return (line: string): void => {
      const match = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(line);
      if (!match) return;
      const [, h = '0', m = '0', s = '0'] = match;
      const elapsed = (Number(h) * 3600 + Number(m) * 60 + Number(s)) * 1000;
      const ratio = clamp(elapsed / durationMs, 0, 1);
      // Throttle: emitir a cada 1% evita inundar o WebSocket.
      if (ratio - last >= 0.01) {
        last = ratio;
        onProgress(ratio);
      }
    };
  }
}
