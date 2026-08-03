import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { FatalJobError } from '../../common/errors/job-error';
import { ProcessRunner } from './process-runner';

const streamSchema = z.object({
  codec_type: z.string().optional(),
  codec_name: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  r_frame_rate: z.string().optional(),
  bit_rate: z.string().optional(),
});

const probeSchema = z.object({
  format: z.object({
    duration: z.string().optional(),
    size: z.string().optional(),
    bit_rate: z.string().optional(),
    format_name: z.string().optional(),
  }),
  streams: z.array(streamSchema),
});

export interface MediaProbe {
  durationMs: number;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrate: number | null;
  sizeBytes: number;
  hasAudio: boolean;
  raw: unknown;
}

@Injectable()
export class FfprobeService {
  constructor(@Inject(ENV) private readonly env: Env) {}

  async probe(filePath: string): Promise<MediaProbe> {
    const stdout = await ProcessRunner.run(
      this.env.FFPROBE_PATH,
      ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', filePath],
      { timeoutMs: 60_000 },
    );

    const parsed = probeSchema.safeParse(JSON.parse(stdout));
    if (!parsed.success) {
      throw new FatalJobError(
        'Não foi possível ler os metadados do vídeo',
        'PROBE_FAILED',
        'O arquivo parece corrompido ou não é um vídeo válido.',
      );
    }

    const { format, streams } = parsed.data;
    const video = streams.find((s) => s.codec_type === 'video');
    const audio = streams.find((s) => s.codec_type === 'audio');

    if (!video && !audio) {
      throw new FatalJobError(
        'Arquivo sem faixas de mídia',
        'NO_STREAMS',
        'Envie um arquivo de vídeo ou áudio válido.',
      );
    }

    return {
      durationMs: Math.round(Number(format.duration ?? 0) * 1000),
      width: video?.width ?? null,
      height: video?.height ?? null,
      fps: FfprobeService.parseFps(video?.r_frame_rate),
      videoCodec: video?.codec_name ?? null,
      audioCodec: audio?.codec_name ?? null,
      bitrate: format.bit_rate ? Number(format.bit_rate) : null,
      sizeBytes: Number(format.size ?? 0),
      hasAudio: Boolean(audio),
      raw: parsed.data,
    };
  }

  /** FFprobe devolve fps como fração ("30000/1001"). */
  private static parseFps(value?: string): number | null {
    if (!value) return null;
    const [num, den] = value.split('/').map(Number);
    if (!num || !den) return null;
    return Math.round((num / den) * 1000) / 1000;
  }
}
