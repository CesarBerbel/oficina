import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  listLeadsQuerySchema,
  updateLeadStatusSchema,
  Permission,
  type ListLeadsQuery,
  type UpdateLeadStatusInput,
} from '@oficina/shared';
import { LeadsService } from './leads.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @RequirePermission(Permission.CUSTOMERS_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listLeadsQuerySchema)) query: ListLeadsQuery,
  ) {
    return this.leads.list(actor.tenantId, query);
  }

  @Post(':id/status')
  @RequirePermission(Permission.CUSTOMERS_WRITE)
  updateStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateLeadStatusSchema)) body: UpdateLeadStatusInput,
  ) {
    return this.leads.updateStatus(actor, id, body.status);
  }
}
