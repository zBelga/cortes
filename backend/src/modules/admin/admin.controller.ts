import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { QueueService } from '../queue/queue.service';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
@UseGuards(SupabaseAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly queue: QueueService,
  ) {}

  @Get('metrics')
  metrics() {
    return this.admin.metrics();
  }

  @Get('queues')
  queues() {
    return this.queue.stats();
  }

  @Get('stage-timings')
  timings() {
    return this.admin.stageTimings();
  }

  @Get('users')
  users() {
    return this.admin.users();
  }

  @Get('failures')
  failures() {
    return this.admin.recentFailures();
  }
}
