import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Logger, type INestApplicationContext } from '@nestjs/common';
import type { ServerOptions } from 'socket.io';
import { RedisService } from '../../infra/redis/redis.service';

/**
 * Adapter de Socket.IO sobre Redis.
 *
 * Sem ele, um evento emitido pela réplica A não chega às sockets conectadas
 * na réplica B — a tela de processamento simplesmente congelaria para metade
 * dos usuários assim que houvesse mais de uma instância da API.
 *
 * Com uma instância só, é inofensivo. É exatamente o tipo de coisa que
 * funciona em desenvolvimento e quebra no primeiro scale-out.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(RedisIoAdapter.name);
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  async connect(): Promise<void> {
    const redis = this.app.get(RedisService, { strict: false });
    // Conexões dedicadas: o pub/sub bloqueia o socket e não pode ser
    // compartilhado com as conexões de comando.
    const pubClient = redis.client.duplicate();
    const subClient = redis.client.duplicate();

    this.adapterConstructor = createAdapter(pubClient, subClient);
    this.logger.log('Adapter Redis do Socket.IO conectado');
  }

  createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) server.adapter(this.adapterConstructor);
    return server;
  }
}
