import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { RedisService } from '../../infra/redis/redis.service';
import { ENV } from '../../config/config.module';
import type { Env } from '../../config/env.schema';
import { RateLimitError } from '../errors/domain-error';
import { RATE_LIMIT_KEY, type RateLimitOptions } from '../decorators/rate-limit.decorator';
import type { AuthenticatedUser } from '../types/authenticated-user';

/**
 * Sliding window por sorted set no Redis.
 * Mais justo que fixed window (não permite o dobro de rajada na virada da janela)
 * e mais barato que token bucket distribuído.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly redis: RedisService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options =
      this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? { limit: this.env.RATE_LIMIT_MAX, windowMs: this.env.RATE_LIMIT_WINDOW_MS };

    const request = context
      .switchToHttp()
      .getRequest<FastifyRequest & { user?: AuthenticatedUser }>();

    const identity = request.user?.id ?? request.ip;
    const route = `${request.method}:${request.routeOptions?.url ?? request.url}`;
    const key = `rl:${identity}:${route}`;
    const cost = options.cost ?? 1;

    const used = await this.redis.slidingWindowIncrement(key, options.windowMs, cost);

    if (used > options.limit) {
      throw new RateLimitError('Muitas requisições. Tente novamente em instantes.', {
        limit: options.limit,
        windowMs: options.windowMs,
      });
    }
    return true;
  }
}
