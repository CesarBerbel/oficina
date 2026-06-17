import { Controller, Get, Query } from '@nestjs/common';
import { listAuditQuerySchema, Permission, type ListAuditQuery } from '@oficina/shared';
import { AuditService } from './audit.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission(Permission.AUDIT_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listAuditQuerySchema)) query: ListAuditQuery,
  ) {
    return this.audit.list(actor.tenantId, query);
  }
}
