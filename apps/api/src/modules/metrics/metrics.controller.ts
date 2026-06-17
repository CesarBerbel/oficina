import { Controller, Get } from '@nestjs/common';
import { Permission } from '@oficina/shared';
import { MetricsService } from './metrics.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @RequirePermission(Permission.AUDIT_READ)
  system(@CurrentUser() actor: AuthenticatedUser) {
    return this.metrics.system(actor.tenantId);
  }

  @Get('outbox')
  @RequirePermission(Permission.AUDIT_READ)
  outbox(@CurrentUser() actor: AuthenticatedUser) {
    return this.metrics.outbox(actor.tenantId);
  }
}
