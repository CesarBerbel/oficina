import { Controller, Get } from '@nestjs/common';
import { Permission } from '@oficina/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PlansService } from './plans.service';

@Controller('billing')
export class QuotaController {
  constructor(private readonly plans: PlansService) {}

  @Get('usage')
  @RequirePermission(Permission.DASHBOARD_READ)
  usage(@CurrentUser() actor: AuthenticatedUser) {
    return this.plans.tenantUsage(actor.tenantId);
  }
}
