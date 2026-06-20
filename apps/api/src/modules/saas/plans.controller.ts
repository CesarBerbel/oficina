import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  assignAccountPlanSchema,
  upsertPlanSchema,
  type AssignAccountPlanInput,
  type UpsertPlanInput,
} from '@oficina/shared';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PlansService } from './plans.service';

@Controller('platform/plans')
@UseGuards(PlatformAdminGuard)
@AllowAuthenticated()
export class PlatformPlansController {
  constructor(private readonly plans: PlansService) {}

  @Get()
  list() {
    return this.plans.list();
  }

  @Post()
  upsert(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(upsertPlanSchema)) body: UpsertPlanInput,
  ) {
    return this.plans.upsert(actor, body);
  }

  @Post('accounts/:accountId')
  assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('accountId') accountId: string,
    @Body(new ZodValidationPipe(assignAccountPlanSchema)) body: AssignAccountPlanInput,
  ) {
    return this.plans.assignToAccount(actor, accountId, body);
  }

  @Get('accounts/:accountId/usage')
  accountUsage(@Param('accountId') accountId: string) {
    return this.plans.accountUsage(accountId);
  }

  @Get('upgrade-requests')
  upgradeRequests() {
    return this.plans.listUpgradeRequests();
  }

  @Post('upgrade-requests/:id/approve')
  approveUpgrade(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.plans.approveUpgrade(actor, id);
  }

  @Post('upgrade-requests/:id/reject')
  rejectUpgrade(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.plans.rejectUpgrade(actor, id);
  }
}
