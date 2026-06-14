import { Body, Controller, Get, Put } from '@nestjs/common';
import { Permission, updateOperationalSettingsSchema, type UpdateOperationalSettingsInput } from '@oficina/shared';
import { DashboardService } from './dashboard.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('metrics')
  @RequirePermission(Permission.DASHBOARD_READ)
  metrics(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.metrics(actor.tenantId);
  }

  @Get('productivity')
  @RequirePermission(Permission.DASHBOARD_READ)
  productivity(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.productivity(actor.tenantId);
  }


  @Get('operational')
  @RequirePermission(Permission.DASHBOARD_READ)
  operational(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.operational(actor.tenantId);
  }

  @Get('operational/settings')
  @RequirePermission(Permission.SETTINGS_MANAGE)
  operationalSettings(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.getOperationalSettings(actor.tenantId);
  }

  @Put('operational/settings')
  @RequirePermission(Permission.SETTINGS_MANAGE)
  updateOperationalSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateOperationalSettingsSchema)) body: UpdateOperationalSettingsInput,
  ) {
    return this.dashboard.updateOperationalSettings(actor.tenantId, body);
  }

  @Get('actions')
  @RequirePermission(Permission.DASHBOARD_READ)
  actions(@CurrentUser() actor: AuthenticatedUser) {
    return this.dashboard.actions(actor.tenantId);
  }
}
