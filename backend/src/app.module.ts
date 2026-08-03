import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { ConfigModule } from './config/config.module';
import { env, isDev } from './config/env';
import { PrismaModule } from './infra/prisma/prisma.module';
import { RedisModule } from './infra/redis/redis.module';
import { StorageModule } from './infra/storage/storage.module';
import { MediaModule } from './infra/media/media.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';

import { AuthModule } from './modules/auth/auth.module';
import { QueueModule } from './modules/queue/queue.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { IntelligenceModule } from './modules/intelligence/intelligence.module';
import { PipelineModule } from './modules/pipeline/pipeline.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ClipsModule } from './modules/clips/clips.module';
import { ExportsModule } from './modules/exports/exports.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { BillingModule } from './modules/billing/billing.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { AdminModule } from './modules/admin/admin.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: env().LOG_LEVEL,
        // requestId em todo log: correlacionar request → job → erro é o que
        // transforma um incidente de 2 horas num de 5 minutos.
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
        transport: isDev() ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
      },
    }),
    ConfigModule,
    PrismaModule,
    RedisModule,
    StorageModule,
    MediaModule,
    AuthModule,
    QueueModule,
    IntelligenceModule,
    PipelineModule,
    RealtimeModule,
    ProjectsModule,
    ClipsModule,
    ExportsModule,
    UploadsModule,
    BillingModule,
    WebhooksModule,
    AdminModule,
    FilesModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: TimeoutInterceptor },
  ],
})
export class AppModule {}
