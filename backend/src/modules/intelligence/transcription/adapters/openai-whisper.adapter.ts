import { createReadStream } from 'node:fs';
import { basename } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { FatalJobError, RetryableJobError } from '../../../../common/errors/job-error';
import { secondsToMs } from '../../../../common/utils/time';
import {
  TranscriptionPort,
  type TranscriptionRequest,
  type TranscriptionResult,
  type TranscriptSegmentDto,
} from '../transcription.port';

const responseSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
  segments: z
    .array(
      z.object({
        id: z.number(),
        start: z.number(),
        end: z.number(),
        text: z.string(),
        avg_logprob: z.number().optional(),
      }),
    )
    .default([]),
  words: z
    .array(z.object({ word: z.string(), start: z.number(), end: z.number() }))
    .default([]),
});

const COST_PER_MINUTE_CENTS = 0.6;

@Injectable()
export class OpenAiWhisperAdapter extends TranscriptionPort {
  readonly name = 'openai-whisper';
  private readonly logger = new Logger(OpenAiWhisperAdapter.name);
  private readonly model = 'whisper-1';

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!this.env.OPENAI_API_KEY) {
      throw new FatalJobError('OPENAI_API_KEY não configurada', 'MISSING_CREDENTIALS');
    }

    const form = new FormData();
    form.append('model', this.model);
    form.append('response_format', 'verbose_json');
    // `word` habilita legendas palavra a palavra; `segment` alimenta a análise semântica.
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
    if (request.language) form.append('language', request.language);
    form.append('file', await this.toBlob(request.audioPath), basename(request.audioPath));

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(20 * 60_000),
    });

    if (!response.ok) {
      const body = await response.text();
      // 429 e 5xx são transitórios; 4xx restante é erro de requisição nosso.
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableJobError(`Whisper ${response.status}: ${body.slice(0, 200)}`, 'PROVIDER_BUSY');
      }
      throw new FatalJobError(`Whisper ${response.status}: ${body.slice(0, 200)}`, 'TRANSCRIPTION_FAILED');
    }

    const data = responseSchema.parse(await response.json());
    request.onProgress?.(1);

    const durationMs = data.duration ? secondsToMs(data.duration) : request.durationMs;
    const words = data.words.map((w) => ({
      w: w.word,
      s: secondsToMs(w.start),
      e: secondsToMs(w.end),
      c: 1,
    }));

    const segments: TranscriptSegmentDto[] = data.segments.map((segment, index) => {
      const startMs = secondsToMs(segment.start);
      const endMs = secondsToMs(segment.end);
      return {
        index,
        startMs,
        endMs,
        text: segment.text.trim(),
        // avg_logprob → probabilidade aproximada, normalizada em 0..1.
        confidence: segment.avg_logprob ? Math.min(1, Math.exp(segment.avg_logprob)) : 0.9,
        words: words.filter((w) => w.s >= startMs && w.e <= endMs),
      };
    });

    const minutes = durationMs / 60_000;
    return {
      provider: this.name,
      model: this.model,
      language: data.language ?? request.language ?? 'unknown',
      confidence: segments.length
        ? segments.reduce((acc, s) => acc + s.confidence, 0) / segments.length
        : 0,
      text: data.text,
      durationMs,
      segments,
      costCents: Math.ceil(minutes * COST_PER_MINUTE_CENTS),
    };
  }

  private async toBlob(path: string): Promise<Blob> {
    const chunks: Buffer[] = [];
    for await (const chunk of createReadStream(path)) chunks.push(chunk as Buffer);
    return new Blob([Buffer.concat(chunks)], { type: 'audio/wav' });
  }
}
