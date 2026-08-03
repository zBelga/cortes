import { Module } from '@nestjs/common';
import { CreditsService } from './credits.service';
import { BillingController } from './billing.controller';

@Module({
  controllers: [BillingController],
  providers: [CreditsService],
  exports: [CreditsService],
})
export class BillingModule {}
