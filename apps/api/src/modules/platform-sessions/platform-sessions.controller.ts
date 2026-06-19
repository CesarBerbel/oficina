import { Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';
import { PlatformSessionsService } from './platform-sessions.service';

/** Sessões ativas globais — restrito ao super admin da plataforma. */
@Controller('platform/sessions')
@UseGuards(PlatformAdminGuard)
@AllowAuthenticated()
export class PlatformSessionsController {
  constructor(private readonly sessions: PlatformSessionsService) {}

  @Get()
  listActive() {
    return this.sessions.listActive();
  }

  @Delete(':id')
  @HttpCode(204)
  revoke(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.sessions.revokeSession(actor, id);
  }

  @Post('users/:userId/logout-all')
  @HttpCode(204)
  revokeUser(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId') userId: string,
  ): Promise<void> {
    return this.sessions.revokeAllForUser(actor, userId);
  }
}
