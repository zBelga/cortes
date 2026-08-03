import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './modules/realtime/redis-io.adapter';
import { env, isDev } from './config/env';

async function bootstrap(): Promise<void> {
  const config = env();

  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // Fastify: ~2x o throughput do Express e menor alocação por request.
    // Esta API é I/O bound, então o overhead do framework aparece no p95.
    new FastifyAdapter({ trustProxy: true, bodyLimit: 2 * 1024 * 1024 }),
    { bufferLogs: true },
  );

  app.useLogger(app.get(Logger));
  app.setGlobalPrefix('api/v1', { exclude: ['health/live', 'health/ready'] });
  app.enableShutdownHooks();

  // Sem este adapter, eventos emitidos por uma réplica não alcançam as
  // sockets conectadas nas outras. Inofensivo com uma instância, essencial
  // na primeira vez que a API escalar horizontalmente.
  const ioAdapter = new RedisIoAdapter(app);
  await ioAdapter.connect();
  app.useWebSocketAdapter(ioAdapter);

  await app.register(import('@fastify/helmet'), {
    contentSecurityPolicy: false, // o frontend define a própria CSP
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  await app.register(import('@fastify/compress'), {
    encodings: ['br', 'gzip'],
    threshold: 1024, // comprimir payload pequeno gasta mais CPU do que economiza banda
  });

  app.enableCors({
    origin: config.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Request-Id'],
  });

  if (isDev()) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('ClipForge API')
        .setDescription('Geração automática de cortes virais')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }

  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  // eslint-disable-next-line no-console
  console.log(`ClipForge API em http://localhost:${config.PORT}/api/v1`);
}

void bootstrap();
