import { Body, Controller, Inject, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { ValidationError } from '../../common/errors/domain-error';
import { StoragePort } from '../../infra/storage/storage.port';
import { StorageKeys } from '../../infra/storage/storage-keys';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const ALLOWED_MIME = new Set(['video/mp4', 'video/quicktime', 'video/x-matroska', 'video/webm']);

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(3).max(100),
  sizeBytes: z.number().int().positive(),
});

@ApiTags('uploads')
@Controller('uploads')
@UseGuards(SupabaseAuthGuard, RateLimitGuard)
export class UploadsController {
  constructor(
    private readonly storage: StoragePort,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * O binário vai direto do browser para o storage.
   * Passar 5 GB pela API custaria memória, banda e um timeout garantido.
   */
  @Post('presign')
  @RateLimit({ limit: 60, windowMs: 60_000, cost: 5 })
  async presign(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(presignSchema)) dto: z.infer<typeof presignSchema>,
  ) {
    if (!ALLOWED_MIME.has(dto.contentType)) {
      throw new ValidationError('Formato não suportado. Use MP4, MOV, MKV ou WebM.');
    }
    if (dto.sizeBytes > this.env.MAX_UPLOAD_BYTES) {
      const limitGb = (this.env.MAX_UPLOAD_BYTES / 1024 ** 3).toFixed(1);
      throw new ValidationError(`Arquivo acima do limite de ${limitGb} GB.`);
    }

    const extension = dto.filename.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const key = StorageKeys.upload(user.id, nanoid(16), extension);

    // O content-type é reverificado por ffprobe no worker: a declaração do
    // cliente nunca é confiável (risco #8).
    return this.storage.presignUpload(key, dto.contentType, 3600);
  }
}
