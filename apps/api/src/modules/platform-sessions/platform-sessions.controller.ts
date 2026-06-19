import { Controller, Get, UseGuards } from '@nestjs/common';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
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
}
