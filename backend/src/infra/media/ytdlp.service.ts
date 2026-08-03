import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { FatalJobError } from '../../common/errors/job-error';
import { ProcessRunner } from './process-runner';

export interface DownloadResult {
  filePath: string;
  title: string;
  externalId: string;
  durationMs: number;
  uploader: string | null;
  thumbnailUrl: string | null;
}

/**
 * Ingestão de YouTube/Twitch. Isolado atrás de um serviço porque é o
 * componente mais frágil do sistema (risco #1 em docs/08-risks.md):
 * quando o yt-dlp quebrar, só este arquivo muda.
 */
@Injectable()
export class YtdlpService {
  private readonly logger = new Logger(YtdlpService.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  async metadata(url: string) {
    const stdout = await ProcessRunner.run(
      this.env.YTDLP_PATH,
      ['--dump-single-json', '--no-warnings', '--no-playlist', url],
      { timeoutMs: 60_000 },
    ).catch((error) => {
      throw this.classify(error);
    });

    const data = JSON.parse(stdout) as Record<string, unknown>;
    return {
      externalId: String(data.id ?? ''),
      title: String(data.title ?? 'Sem título'),
      durationMs: Math.round(Number(data.duration ?? 0) * 1000),
      uploader: (data.uploader as string | undefined) ?? null,
      thumbnailUrl: (data.thumbnail as string | undefined) ?? null,
    };
  }

  async download(
    url: string,
    outputTemplate: string,
    onProgress?: (ratio: number) => void,
  ): Promise<DownloadResult> {
    const meta = await this.metadata(url);

    await ProcessRunner.run(
      this.env.YTDLP_PATH,
      [
        // Prefere MP4 já mesclado: evita um passo de remux.
        '-f', 'bv*[height<=1080][ext=mp4]+ba[ext=m4a]/b[height<=1080]/b',
        '--merge-output-format', 'mp4',
        '--no-playlist',
        '--no-warnings',
        '--newline',
        '--retries', '3',
        '--fragment-retries', '5',
        '--concurrent-fragments', '4',
        '-o', outputTemplate,
        url,
      ],
      {
        timeoutMs: 60 * 60_000,
        onStderrLine: (line) => {
          const match = /\[download\]\s+([0-9.]+)%/.exec(line);
          if (match?.[1]) onProgress?.(Number(match[1]) / 100);
        },
      },
    ).catch((error) => {
      throw this.classify(error);
    });

    return { ...meta, filePath: outputTemplate.replace('%(ext)s', 'mp4') };
  }

  /**
   * Vídeo privado, removido ou geo-bloqueado é falha **definitiva**:
   * repetir 3 vezes só desperdiça worker e atrasa a fila dos outros.
   */
  private classify(error: unknown): Error {
    const message = String((error as { cause?: unknown }).cause ?? (error as Error).message ?? '');

    const fatal: Array<[RegExp, string, string]> = [
      [/private video|sign in to confirm/i, 'VIDEO_PRIVATE', 'Este vídeo é privado ou exige login.'],
      [/video unavailable|has been removed/i, 'VIDEO_UNAVAILABLE', 'O vídeo não está mais disponível.'],
      [/not available in your country|geo/i, 'GEO_BLOCKED', 'O vídeo está bloqueado na nossa região.'],
      [/age.?restricted/i, 'AGE_RESTRICTED', 'Vídeo com restrição de idade não pode ser baixado.'],
      [/unsupported url/i, 'UNSUPPORTED_URL', 'Não reconhecemos essa URL. Use YouTube ou Twitch.'],
      [/is live/i, 'LIVE_STREAM', 'Transmissões ao vivo não são suportadas. Aguarde o VOD.'],
    ];

    for (const [pattern, code, hint] of fatal) {
      if (pattern.test(message)) return new FatalJobError(message.slice(0, 300), code, hint);
    }

    this.logger.warn(`Falha transitória no yt-dlp: ${message.slice(0, 200)}`);
    return error as Error;
  }
}
