import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { RedisService } from '../../infra/redis/redis.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Liveness: o processo respondeu, logo está vivo. Não toca em dependências. */
  @Public()
  @Get('live')
  live() {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /**
   * Readiness: só entra no balanceador quando as dependências respondem.
   * Falhar aqui tira a instância de rotação em vez de servir erro 500.
   */
  @Public()
  @Get('ready')
  async ready() {
    const [db, cache] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);

    const checks = {
      database: db.status === 'fulfilled',
      redis: cache.status === 'fulfilled',
    };
    const healthy = Object.values(checks).every(Boolean);

    return { status: healthy ? 'ok' : 'degraded', checks };
  }
}
