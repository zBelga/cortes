import { createReadStream } from 'node:fs';
import { extname } from 'node:path';
import { Controller, Get, Put, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { pipeline } from 'node:stream/promises';
import { Public } from '../../common/decorators/public.decorator';
import { ValidationError } from '../../common/errors/domain-error';
import { FileTokenService } from '../../infra/storage/file-token.service';
import { LocalDiskStorageAdapter } from '../../infra/storage/local-disk-storage.adapter';

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.json': 'application/json',
};

/**
 * Servidor de arquivos do storage local.
 *
 * Público por design: a autorização vem do token HMAC na query, não da
 * sessão. É o mesmo modelo das URLs assinadas do S3 — o link é a permissão,
 * e expira sozinho. Isso permite que a tag <video> do navegador consuma o
 * arquivo diretamente, sem cabeçalho de autenticação.
 */
@ApiExcludeController()
@Controller('files')
export class FilesController {
  constructor(
    private readonly tokens: FileTokenService,
    private readonly storage: LocalDiskStorageAdapter,
  ) {}

  @Public()
  @Get()
  async download(
    @Query('token') token: string,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (!token) throw new ValidationError('Token ausente');

    const key = this.tokens.verify(token);
    const path = this.storage.absolutePath(key);
    const size = await this.storage.statBytes(key);
    const contentType = MIME[extname(key).toLowerCase()] ?? 'application/octet-stream';

    const range = request.headers.range;

    // Sem suporte a Range, o <video> nao consegue buscar posicao: o navegador
    // teria de baixar o arquivo inteiro so para pular para os 30 segundos.
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number(match[1]) : 0;
      const end = match?.[2] ? Number(match[2]) : size - 1;

      if (start >= size || end >= size || start > end) {
        void reply.status(416).header('Content-Range', `bytes */${size}`).send();
        return;
      }

      void reply
        .status(206)
        .header('Content-Type', contentType)
        .header('Content-Range', `bytes ${start}-${end}/${size}`)
        .header('Accept-Ranges', 'bytes')
        .header('Content-Length', end - start + 1)
        .header('Cache-Control', 'private, max-age=3600')
        .send(createReadStream(path, { start, end }));
      return;
    }

    void reply
      .header('Content-Type', contentType)
      .header('Content-Length', size)
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', 'private, max-age=3600')
      .send(createReadStream(path));
  }

  /** Destino do upload direto do navegador, equivalente ao PUT presignado do S3. */
  @Public()
  @Put('upload')
  async upload(
    @Query('token') token: string,
    @Req() request: FastifyRequest,
  ): Promise<{ ok: true; key: string }> {
    if (!token) throw new ValidationError('Token ausente');

    const key = this.tokens.verify(token, true);
    await this.storage.putObject(key, request.raw, 'application/octet-stream');
    return { ok: true, key };
  }
}
