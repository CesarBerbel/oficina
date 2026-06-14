import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import {
  Permission,
  updateCrmSettingsSchema,
  type UpdateCrmSettingsInput,
} from '@oficina/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { CrmService } from './crm.service';

@Controller('crm')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('post-sale')
  @RequirePermission(Permission.CUSTOMERS_READ)
  postSale(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    return this.crm.postSale(actor.tenantId, Number(limit) || 80);
  }

  @Get('settings')
  @RequirePermission(Permission.SETTINGS_MANAGE)
  settings(@CurrentUser() actor: AuthenticatedUser) {
    return this.crm.getSettings(actor.tenantId);
  }

  @Put('settings')
  @RequirePermission(Permission.SETTINGS_MANAGE)
  updateSettings(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateCrmSettingsSchema)) body: UpdateCrmSettingsInput,
  ) {
    return this.crm.updateSettings(actor, body);
  }
}
