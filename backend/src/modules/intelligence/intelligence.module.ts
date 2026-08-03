import { Module } from '@nestjs/common';
import { TranscriptionModule } from './transcription/transcription.module';
import { LlmModule } from './llm/llm.module';
import { AudioAnalysisService } from './analysis/audio-analysis.service';
import { VisualAnalysisService } from './analysis/visual-analysis.service';
import { SemanticAnalysisService } from './analysis/semantic-analysis.service';
import { MarketingCopyService } from './marketing/marketing-copy.service';

@Module({
  imports: [TranscriptionModule, LlmModule],
  providers: [
    AudioAnalysisService,
    VisualAnalysisService,
    SemanticAnalysisService,
    MarketingCopyService,
  ],
  exports: [
    TranscriptionModule,
    LlmModule,
    AudioAnalysisService,
    VisualAnalysisService,
    SemanticAnalysisService,
    MarketingCopyService,
  ],
})
export class IntelligenceModule {}
