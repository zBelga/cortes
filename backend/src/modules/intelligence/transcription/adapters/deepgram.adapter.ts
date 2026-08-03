import { createReadStream } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { FatalJobError, RetryableJobError } from '../../../../common/errors/job-error';
import { secondsToMs } from '../../../../common/utils/time';
import {
  TranscriptionPort,
  type TranscriptionRequest,
  type TranscriptionResult,
} from '../transcription.port';

const schema = z.object({
  metadata: z.object({ duration: z.number() }),
  results: z.object({
    channels: z.array(
      z.object({
        detected_language: z.string().optional(),
        alternatives: z.array(
          z.object({
            transcript: z.string(),
            confidence: z.number(),
            words: z
              .array(
                z.object({
                  word: z.string(),
                  punctuated_word: z.string().optional(),
                  start: z.number(),
                  end: z.number(),
                  confidence: z.number(),
                  speaker: z.number().optional(),
                }),
              )
              .default([]),
          }),
        ),
      }),
    ),
    utterances: z
      .array(z.object({ start: z.number(), end: z.number(), transcript: z.string(), confidence: z.number(), speaker: z.number().optional() }))
      .default([]),
  }),
});

const COST_PER_MINUTE_CENTS = 0.43;

/** Deepgram Nova: mais rápido que Whisper e traz diarização de falantes nativa. */
@Injectable()
export class DeepgramAdapter extends TranscriptionPort {
  readonly name = 'deepgram';
  private readonly model = 'nova-2';

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    if (!this.env.DEEPGRAM_API_KEY) {
      throw new FatalJobError('DEEPGRAM_API_KEY não configurada', 'MISSING_CREDENTIALS');
    }

    const params = new URLSearchParams({
      model: this.model,
      smart_format: 'true',
      punctuate: 'true',
      diarize: 'true',
      utterances: 'true',
      detect_language: request.language ? 'false' : 'true',
      ...(request.language ? { language: request.language } : {}),
    });

    const response = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${this.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'audio/wav' },
      body: createReadStream(request.audioPath) as unknown as BodyInit,
      duplex: 'half',
      signal: AbortSignal.timeout(20 * 60_000),
    } as RequestInit);

    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        throw new RetryableJobError(`Deepgram ${response.status}`, 'PROVIDER_BUSY');
      }
      throw new FatalJobError(`Deepgram ${response.status}`, 'TRANSCRIPTION_FAILED');
    }

    const data = schema.parse(await response.json());
    const channel = data.results.channels[0];
    const alternative = channel?.alternatives[0];
    if (!alternative) throw new FatalJobError('Deepgram devolveu resposta vazia', 'EMPTY_RESULT');

    const utterances = data.results.utterances.length
      ? data.results.utterances
      : [{ start: 0, end: data.metadata.duration, transcript: alternative.transcript, confidence: alternative.confidence }];

    return {
      provider: this.name,
      model: this.model,
      language: channel?.detected_language ?? request.language ?? 'unknown',
      confidence: alternative.confidence,
      text: alternative.transcript,
      durationMs: secondsToMs(data.metadata.duration),
      segments: utterances.map((utterance, index) => {
        const startMs = secondsToMs(utterance.start);
        const endMs = secondsToMs(utterance.end);
        return {
          index,
          startMs,
          endMs,
          text: utterance.transcript.trim(),
          confidence: utterance.confidence,
          speaker: utterance.speaker !== undefined ? `S${utterance.speaker}` : undefined,
          words: alternative.words
            .filter((w) => secondsToMs(w.start) >= startMs && secondsToMs(w.end) <= endMs)
            .map((w) => ({
              w: w.punctuated_word ?? w.word,
              s: secondsToMs(w.start),
              e: secondsToMs(w.end),
              c: w.confidence,
            })),
        };
      }),
      costCents: Math.ceil((data.metadata.duration / 60) * COST_PER_MINUTE_CENTS),
    };
  }
}
