import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import { cursorPaginationSchema, type CursorPagination } from '../../common/utils/pagination';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { createExportSchema, type CreateExportDto } from './dto/create-export.dto';
import { ExportsService } from './exports.service';

@ApiTags('exports')
@Controller()
@UseGuards(SupabaseAuthGuard, RateLimitGuard)
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  @Post('clips/:clipId/exports')
  @RateLimit({ limit: 120, windowMs: 60_000, cost: 10 })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('clipId') clipId: string,
    @Body(zodPipe(createExportSchema)) dto: CreateExportDto,
  ) {
    return this.exports.create(user, clipId, dto);
  }

  @Get('exports/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exports.detail(user.id, id);
  }

  @Get('exports')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodPipe(cursorPaginationSchema)) query: CursorPagination,
  ) {
    return this.exports.list(user.id, query.limit, query.cursor);
  }
}
