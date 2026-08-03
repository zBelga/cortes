import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';
import { Timeout } from '../../common/decorators/timeout.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  createProjectSchema,
  listProjectsSchema,
  type CreateProjectDto,
  type ListProjectsDto,
} from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@Controller('projects')
@UseGuards(SupabaseAuthGuard, RateLimitGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  /** Custo 20: criar projeto dispara minutos de worker, listar custa uma query. */
  @Post()
  @RateLimit({ limit: 120, windowMs: 60_000, cost: 20 })
  // Antes de responder, lemos os metadados do vídeo para estimar os créditos.
  // O yt-dlp leva alguns segundos e o teto padrão de 15s estouraria em links lentos.
  @Timeout(45_000)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(zodPipe(createProjectSchema)) dto: CreateProjectDto,
  ) {
    return this.projects.create(user, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(zodPipe(listProjectsSchema)) query: ListProjectsDto,
  ) {
    return this.projects.list(user.id, query);
  }

  @Get(':id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.detail(user.id, id);
  }

  @Get(':id/pipeline')
  pipeline(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.pipeline(user.id, id);
  }

  @Post(':id/retry')
  @RateLimit({ limit: 120, windowMs: 60_000, cost: 20 })
  retry(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.retry(user, id);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.projects.remove(user.id, id);
  }
}
