import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import {
  createTenantDomainSchema,
  Permission,
  type CreateTenantDomainInput,
} from '@oficina/shared';
import { TenantDomainsService } from './tenant-domains.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('tenant-domains')
export class TenantDomainsController {
  constructor(private readonly domains: TenantDomainsService) {}

  @Get()
  @RequirePermission(Permission.SETTINGS_MANAGE)
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.domains.list(actor.tenantId);
  }

  @Post()
  @RequirePermission(Permission.SETTINGS_MANAGE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createTenantDomainSchema)) body: CreateTenantDomainInput,
  ) {
    return this.domains.create(actor, body);
  }

  @Delete(':id')
  @RequirePermission(Permission.SETTINGS_MANAGE)
  @HttpCode(204)
  async remove(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    await this.domains.remove(actor, id);
  }
}
