import { createReadStream } from 'node:fs';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { RetryableJobError } from '../../../../common/errors/job-error';
import { secondsToMs } from '../../../../common/utils/time';
import {
  TranscriptionPort,
  type TranscriptionRequest,
  type TranscriptionResult,
  type TranscriptSegmentDto,
  type TranscriptWord,
} from '../transcription.port';

/**
 * Resposta `verbose_json` no formato da OpenAI. Servidores locais de
 * faster-whisper implementam o mesmo contrato — por isso um único schema
 * atende tanto a nuvem quanto o self-hosted.
 */
const responseSchema = z.object({
  text: z.string(),
  language: z.string().optional(),
  duration: z.number().optional(),
  segments: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
        avg_logprob: z.number().optional(),
        words: z
          .array(
            z.object({
              word: z.string(),
              start: z.number(),
              end: z.number(),
              probability: z.number().optional(),
            }),
          )
          .optional(),
      }),
    )
    .default([]),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
        probability: z.number().optional(),
      }),
    )
    .default([]),
});

/**
 * faster-whisper rodando localmente, atrás de uma API compatível com a da OpenAI.
 *
 * Custo zero por minuto e nenhum áudio sai da máquina. Em CPU, transcrever
 * costuma levar de 0,3x a 1x a duração do vídeo com o modelo `small`;
 * com GPU e `large-v3` cai para algo entre 0,05x e 0,1x.
 */
@Injectable()
export class FasterWhisperAdapter extends TranscriptionPort {
  readonly name = 'faster-whisper';
  private readonly logger = new Logger(FasterWhisperAdapter.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const model = this.env.WHISPER_MODEL;

    const form = new FormData();
    form.append('model', model);
    form.append('response_format', 'verbose_json');
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
    // VAD pula silêncio: menos áudio processado, menos tempo de CPU.
    form.append('vad_filter', 'true');
    if (request.language) form.append('language', request.language);
    form.append('file', await this.toBlob(request.audioPath), 'audio.wav');

    const url = `${this.env.FASTER_WHISPER_URL.replace(/\/+$/, '')}/v1/audio/transcriptions`;

    const response = await fetch(url, {
      method: 'POST',
      body: form,
      // Em CPU, um vídeo longo pode levar muito tempo. O teto é generoso
      // de propósito: cancelar no meio desperdiçaria todo o trabalho já feito.
      signal: AbortSignal.timeout(4 * 60 * 60_000),
    }).catch((error: Error) => {
      throw new RetryableJobError(
        `Servidor de transcrição local inacessível em ${url}. ` +
          'Rode `pnpm ai:up` para subir o contêiner.',
        'PROVIDER_UNAVAILABLE',
        error,
      );
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new RetryableJobError(
        `faster-whisper ${response.status}: ${body.slice(0, 200)}`,
        'PROVIDER_ERROR',
      );
    }

    const data = responseSchema.parse(await response.json());
    request.onProgress?.(1);

    const durationMs = data.duration ? secondsToMs(data.duration) : request.durationMs;
    const flatWords: TranscriptWord[] = data.words.map((w) => ({
      w: w.word,
      s: secondsToMs(w.start),
      e: secondsToMs(w.end),
      c: w.probability ?? 1,
    }));

    const segments: TranscriptSegmentDto[] = data.segments.map((segment, index) => {
      const startMs = secondsToMs(segment.start);
      const endMs = secondsToMs(segment.end);

      // Alguns servidores devolvem as palavras dentro do segmento, outros só
      // na lista raiz. Aceitamos as duas formas em vez de exigir uma.
      const words = segment.words?.length
        ? segment.words.map((w) => ({
            w: w.word,
            s: secondsToMs(w.start),
            e: secondsToMs(w.end),
            c: w.probability ?? 1,
          }))
        : flatWords.filter((w) => w.s >= startMs && w.e <= endMs);

      return {
        index,
        startMs,
        endMs,
        text: segment.text.trim(),
        confidence: segment.avg_logprob ? Math.min(1, Math.exp(segment.avg_logprob)) : 0.9,
        words,
      };
    });

    const confidence = segments.length
      ? segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
      : 0;

    this.logger.log(
      `Transcrição local concluída: ${segments.length} trechos, modelo ${model}`,
    );

    return {
      provider: this.name,
      model,
      language: data.language ?? request.language ?? 'unknown',
      confidence,
      text: data.text.trim(),
      durationMs,
      segments,
      // Self-hosted: o custo é de infraestrutura, não por minuto transcrito.
      costCents: 0,
    };
  }

  private async toBlob(path: string): Promise<Blob> {
    const chunks: Buffer[] = [];
    for await (const chunk of createReadStream(path)) chunks.push(chunk as Buffer);
    return new Blob([Buffer.concat(chunks)], { type: 'audio/wav' });
  }
}
