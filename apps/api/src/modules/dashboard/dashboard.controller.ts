import { Controller, Get } from '@nestjs/common';
import { Permission } from '@oficina/shared';
import { DashboardService } from './dashboard.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('metrics')
  @RequirePermission(Permission.DASHBOARD_READ)
  metrics(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.metrics(actor.tenantId);
  }

  @Get('actions')
  @RequirePermission(Permission.DASHBOARD_READ)
  actions(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.actions(actor.tenantId);
  }
}
