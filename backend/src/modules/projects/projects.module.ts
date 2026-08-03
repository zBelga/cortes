import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { PipelineModule } from '../pipeline/pipeline.module';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';

@Module({
  imports: [BillingModule, PipelineModule],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
