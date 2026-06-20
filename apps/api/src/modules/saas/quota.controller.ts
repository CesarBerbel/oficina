import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  Permission,
  requestPlanUpgradeSchema,
  type RequestPlanUpgradeInput,
} from '@oficina/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
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

  /** Planos ativos para o cliente ver/escolher. */
  @Get('plans')
  @RequirePermission(Permission.DASHBOARD_READ)
  activePlans() {
    return this.plans.listActive();
  }

  /** A conta solicita upgrade de plano (vai para aprovação do super admin). */
  @Post('upgrade-request')
  @RequirePermission(Permission.SETTINGS_MANAGE)
  requestUpgrade(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(requestPlanUpgradeSchema)) body: RequestPlanUpgradeInput,
  ) {
    return this.plans.requestUpgrade(actor.accountId, body.planId);
  }
}
