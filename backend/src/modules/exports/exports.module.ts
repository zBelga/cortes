import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ExportsService } from './exports.service';
import { ExportsController } from './exports.controller';
import { RenderService } from './render.service';

@Module({
  imports: [WebhooksModule],
  controllers: [ExportsController],
  providers: [ExportsService, RenderService],
  exports: [ExportsService, RenderService],
})
export class ExportsModule {}
