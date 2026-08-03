import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { ENV } from '../../../../config/config.module';
import type { Env } from '../../../../config/env.schema';
import { FatalJobError } from '../../../../common/errors/job-error';
import { ProcessRunner } from '../../../../infra/media/process-runner';
import { clamp } from '../../../../common/utils/time';
import {
  TranscriptionPort,
  type TranscriptionRequest,
  type TranscriptionResult,
  type TranscriptSegmentDto,
  type TranscriptWord,
} from '../transcription.port';

/** Formato do `--output-json-full` do whisper.cpp. Offsets já vêm em ms. */
const offsets = z.object({ from: z.number(), to: z.number() });

const outputSchema = z.object({
  result: z.object({ language: z.string().optional() }).optional(),
  transcription: z
    .array(
      z.object({
        offsets,
        text: z.string(),
        tokens: z
          .array(z.object({ text: z.string(), offsets, p: z.number().optional() }))
          .optional(),
      }),
    )
    .default([]),
});

/**
 * Transcrição via whisper.cpp — um executável, sem Python, sem Docker.
 *
 * É o caminho de menor dependência no Windows: o binário tem 8 MB, o modelo
 * é um arquivo único, e a chamada é igual à do FFmpeg. Em troca, não há
 * servidor para manter no ar nem imagem para baixar.
 */
@Injectable()
export class WhisperCppAdapter extends TranscriptionPort {
  readonly name = 'whisper-cpp';
  private readonly logger = new Logger(WhisperCppAdapter.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  async transcribe(request: TranscriptionRequest): Promise<TranscriptionResult> {
    const model = this.env.WHISPER_MODEL_PATH;

    await fs.access(model).catch(() => {
      throw new FatalJobError(
        `Modelo do Whisper não encontrado em ${model}`,
        'WHISPER_MODEL_MISSING',
        'Rode o instalador novamente para baixar o modelo de transcrição.',
      );
    });

    // O whisper.cpp escreve o JSON ao lado do prefixo informado.
    const prefix = join(dirname(request.audioPath), 'transcript');
    const args = [
      '-m', model,
      '-f', request.audioPath,
      '--output-json-full',
      '--output-file', prefix,
      // Sem impressão progressiva: o stdout limpo evita ruído no log.
      '--no-prints',
    ];

    if (this.env.WHISPER_THREADS > 0) args.push('-t', String(this.env.WHISPER_THREADS));
    if (request.language) args.push('-l', request.language);
    else args.push('-l', 'auto');

    await ProcessRunner.run(this.env.WHISPER_BIN, args, {
      // Em CPU, um vídeo longo leva o mesmo tempo que a própria duração.
      // O teto é folgado porque abortar no meio joga fora todo o trabalho.
      timeoutMs: 6 * 60 * 60_000,
      onStderrLine: (line) => {
        // O binário reporta progresso como "progress = 42%".
        const match = /progress\s*=\s*(\d+)%/.exec(line);
        if (match?.[1]) request.onProgress?.(clamp(Number(match[1]) / 100, 0, 1));
      },
    });

    const raw = await fs.readFile(`${prefix}.json`, 'utf8').catch(() => {
      throw new FatalJobError(
        'whisper.cpp não gerou a transcrição',
        'WHISPER_NO_OUTPUT',
        'Verifique se o áudio do vídeo não está mudo.',
      );
    });

    const data = outputSchema.parse(JSON.parse(raw));
    request.onProgress?.(1);

    const segments: TranscriptSegmentDto[] = data.transcription
      .map((entry, index) => ({
        index,
        startMs: Math.round(entry.offsets.from),
        endMs: Math.round(entry.offsets.to),
        text: entry.text.trim(),
        confidence: WhisperCppAdapter.averageProbability(entry.tokens),
        words: WhisperCppAdapter.toWords(entry.tokens),
      }))
      .filter((segment) => segment.text.length > 0);

    const confidence = segments.length
      ? segments.reduce((sum, s) => sum + s.confidence, 0) / segments.length
      : 0;

    this.logger.log(`Transcrição local concluída: ${segments.length} trechos`);

    return {
      provider: this.name,
      model: model.split(/[/\\]/).pop() ?? model,
      language: data.result?.language ?? request.language ?? 'unknown',
      confidence,
      text: segments.map((s) => s.text).join(' '),
      durationMs: segments.at(-1)?.endMs ?? request.durationMs,
      segments,
      costCents: 0,
    };
  }

  /**
   * Tokens do whisper.cpp são subpalavras ("in", "cri", "vel"). As legendas
   * animadas precisam de palavras inteiras, então remontamos: todo token que
   * não começa com espaço pertence à palavra anterior.
   */
  private static toWords(
    tokens?: { text: string; offsets: { from: number; to: number }; p?: number }[],
  ): TranscriptWord[] {
    if (!tokens?.length) return [];

    const words: TranscriptWord[] = [];

    for (const token of tokens) {
      // Marcadores especiais do modelo, como [_BEG_] ou <|pt|>.
      if (/^\s*[\[<]/.test(token.text)) continue;

      const startsWord = token.text.startsWith(' ') || words.length === 0;
      const text = token.text.trim();
      if (!text) continue;

      if (startsWord) {
        words.push({
          w: text,
          s: Math.round(token.offsets.from),
          e: Math.round(token.offsets.to),
          c: token.p ?? 1,
        });
        continue;
      }

      const previous = words[words.length - 1]!;
      previous.w += text;
      previous.e = Math.round(token.offsets.to);
      previous.c = Math.min(previous.c, token.p ?? 1);
    }

    return words;
  }

  private static averageProbability(tokens?: { p?: number }[]): number {
    const values = (tokens ?? []).map((t) => t.p).filter((p): p is number => typeof p === 'number');
    if (!values.length) return 0.9;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }
}
