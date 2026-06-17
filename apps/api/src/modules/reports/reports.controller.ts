import { Controller, Get, Query } from '@nestjs/common';
import { Permission } from '@oficina/shared';
import { ReportsService } from './reports.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @RequirePermission(Permission.DASHBOARD_READ)
  summary(@CurrentUser() actor: AuthenticatedUser, @Query('periodDays') periodDays?: string) {
    return this.reports.summary(actor.tenantId, Number(periodDays) || 180);
  }
}
