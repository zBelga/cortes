import { Module } from '@nestjs/common';
import { IntelligenceModule } from '../intelligence/intelligence.module';
import { BillingModule } from '../billing/billing.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { PipelineProgressService } from './pipeline-progress.service';
import { PipelineService } from './pipeline.service';
import { IngestStage } from './stages/ingest.stage';
import { UnderstandStage } from './stages/understand.stage';
import { ComposeStage } from './stages/compose.stage';
import { FinalizeStage } from './stages/finalize.stage';

@Module({
  imports: [IntelligenceModule, BillingModule, WebhooksModule],
  providers: [
    PipelineProgressService,
    PipelineService,
    IngestStage,
    UnderstandStage,
    ComposeStage,
    FinalizeStage,
  ],
  exports: [PipelineProgressService, PipelineService],
})
export class PipelineModule {}
