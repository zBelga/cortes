import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SupabaseAuthGuard } from '../auth/supabase-auth.guard';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { zodPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import {
  editDocumentSchema,
  listClipsSchema,
  updateClipSchema,
  type EditDocumentDto,
  type ListClipsDto,
  type UpdateClipDto,
} from './dto/clip.dto';
import { ClipsService } from './clips.service';

@ApiTags('clips')
@Controller()
@UseGuards(SupabaseAuthGuard, RateLimitGuard)
export class ClipsController {
  constructor(private readonly clips: ClipsService) {}

  @Get('projects/:projectId/clips')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('projectId') projectId: string,
    @Query(zodPipe(listClipsSchema)) query: ListClipsDto,
  ) {
    return this.clips.listByProject(user.id, projectId, query);
  }

  @Get('projects/:projectId/timeline')
  timeline(@CurrentUser() user: AuthenticatedUser, @Param('projectId') projectId: string) {
    return this.clips.timeline(user.id, projectId);
  }

  @Get('clips/:id')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clips.detail(user.id, id);
  }

  @Patch('clips/:id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(updateClipSchema)) dto: UpdateClipDto,
  ) {
    return this.clips.update(user.id, id, dto);
  }

  @Post('clips/:id/versions')
  createVersion(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(zodPipe(editDocumentSchema)) document: EditDocumentDto,
  ) {
    return this.clips.createVersion(user.id, id, document);
  }

  @Post('clips/:id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clips.duplicate(user.id, id);
  }

  @Delete('clips/:id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.clips.remove(user.id, id);
  }
}
