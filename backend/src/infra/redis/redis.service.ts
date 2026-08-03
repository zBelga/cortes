import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis, { type RedisOptions } from 'ioredis';
import { env } from '../../config/env';

/**
 * Três conexões separadas por design:
 *  · `client`   — comandos normais (cache, rate limit)
 *  · `publisher`/`subscriber` — pub/sub bloqueia a conexão, não pode compartilhar
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  readonly client: Redis;
  readonly publisher: Redis;
  readonly subscriber: Redis;

  constructor() {
    const options: RedisOptions = {
      maxRetriesPerRequest: null, // exigido pelo BullMQ
      enableReadyCheck: true,
      retryStrategy: (times) => Math.min(times * 200, 5_000),
    };

    this.client = new Redis(env().REDIS_URL, options);
    this.publisher = new Redis(env().REDIS_URL, options);
    this.subscriber = new Redis(env().REDIS_URL, options);

    this.client.on('error', (e) => this.logger.error(`Redis: ${e.message}`));
  }

  // ── cache ────────────────────────────────────────────────────────────────

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /** Cache-aside com proteção contra stampede: uma única thread recalcula. */
  async remember<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const lockKey = `${key}:lock`;
    const acquired = await this.client.set(lockKey, '1', 'EX', 10, 'NX');

    if (!acquired) {
      await new Promise((r) => setTimeout(r, 60));
      const retry = await this.get<T>(key);
      if (retry !== null) return retry;
    }

    try {
      const value = await factory();
      await this.set(key, value, ttlSeconds);
      return value;
    } finally {
      await this.client.del(lockKey);
    }
  }

  async invalidate(pattern: string): Promise<void> {
    // SCAN em vez de KEYS: KEYS bloqueia o Redis inteiro.
    const stream = this.client.scanStream({ match: pattern, count: 200 });
    for await (const keys of stream) {
      const batch = keys as string[];
      if (batch.length) await this.client.unlink(...batch);
    }
  }

  // ── rate limit ───────────────────────────────────────────────────────────

  /** Sliding window atômico via pipeline. Retorna o consumo na janela. */
  async slidingWindowIncrement(key: string, windowMs: number, cost = 1): Promise<number> {
    const now = Date.now();
    const pipeline = this.client.pipeline();
    pipeline.zremrangebyscore(key, 0, now - windowMs);
    for (let i = 0; i < cost; i += 1) {
      pipeline.zadd(key, now, `${now}-${Math.random().toString(36).slice(2, 10)}`);
    }
    pipeline.zcard(key);
    pipeline.pexpire(key, windowMs);

    const results = await pipeline.exec();
    const cardinality = results?.[results.length - 2]?.[1];
    return typeof cardinality === 'number' ? cardinality : 0;
  }

  // ── pub/sub ──────────────────────────────────────────────────────────────

  async publish(channel: string, payload: unknown): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.client.quit(),
      this.publisher.quit(),
      this.subscriber.quit(),
    ]);
  }
}
