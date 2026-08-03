import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { env, isDev } from '../../config/env';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: { db: { url: env().DATABASE_URL } },
      log: isDev()
        ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
        : ['warn', 'error'],
    });

    if (isDev()) {
      // Detector de query lenta em desenvolvimento: N+1 aparece aqui antes de virar incidente.
      // @ts-expect-error tipagem de eventos do Prisma depende do log configurado acima
      this.$on('query', (e: { duration: number; query: string }) => {
        if (e.duration > 120) this.logger.warn(`Query lenta (${e.duration}ms): ${e.query}`);
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Postgres conectado');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
