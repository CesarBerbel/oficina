import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  updateSiteSettingsSchema,
  Permission,
  type UpdateSiteSettingsInput,
} from '@oficina/shared';
import { SiteService } from './site.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('site-settings')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Get()
  @RequirePermission(Permission.SITE_MANAGE)
  get(@CurrentUser() actor: AuthenticatedUser) {
    return this.site.get(actor.tenantId);
  }

  @Put()
  @RequirePermission(Permission.SITE_MANAGE)
  update(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateSiteSettingsSchema)) body: UpdateSiteSettingsInput,
  ) {
    return this.site.update(actor, body);
  }
}
