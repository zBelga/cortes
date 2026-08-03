import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CreditsService } from './credits.service';

@ApiTags('billing')
@Controller('billing')
@UseGuards(SupabaseAuthGuard)
export class BillingController {
  constructor(private readonly credits: CreditsService) {}

  @Get('balance')
  async balance(@CurrentUser() user: AuthenticatedUser) {
    return { balance: await this.credits.balance(user.id), plan: user.plan };
  }

  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser) {
    return this.credits.history(user.id);
  }
}
