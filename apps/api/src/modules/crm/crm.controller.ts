import { Controller, Get, Query } from '@nestjs/common';
import { Permission } from '@oficina/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
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
}
