import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  createFinancialEntrySchema,
  listFinancialEntriesQuerySchema,
  payFinancialEntrySchema,
  Permission,
  syncPurchaseFinancialSchema,
  syncServiceOrderFinancialSchema,
  type CreateFinancialEntryInput,
  type ListFinancialEntriesQuery,
  type PayFinancialEntryInput,
  type SyncPurchaseFinancialInput,
  type SyncServiceOrderFinancialInput,
} from '@oficina/shared';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { FinancialService } from './financial.service';

@Controller('financial')
export class FinancialController {
  constructor(private readonly financial: FinancialService) {}

  @Get('summary')
  @RequirePermission(Permission.FINANCE_READ)
  summary(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.financial.summary(actor.tenantId, { from, to });
  }

  @Get('entries')
  @RequirePermission(Permission.FINANCE_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listFinancialEntriesQuerySchema)) query: ListFinancialEntriesQuery,
  ) {
    return this.financial.list(actor.tenantId, query);
  }

  @Get('entries/:id')
  @RequirePermission(Permission.FINANCE_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.financial.findOne(actor.tenantId, id);
  }

  @Post('entries')
  @RequirePermission(Permission.FINANCE_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createFinancialEntrySchema)) body: CreateFinancialEntryInput,
  ) {
    return this.financial.create(actor, body);
  }

  @Post('entries/:id/pay')
  @RequirePermission(Permission.FINANCE_WRITE)
  pay(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(payFinancialEntrySchema)) body: PayFinancialEntryInput,
  ) {
    return this.financial.pay(actor, id, body);
  }

  @Post('entries/:id/cancel')
  @RequirePermission(Permission.FINANCE_WRITE)
  cancel(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.financial.cancel(actor, id);
  }

  @Post('sync/service-order')
  @RequirePermission(Permission.FINANCE_WRITE)
  syncServiceOrder(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(syncServiceOrderFinancialSchema))
    body: SyncServiceOrderFinancialInput,
  ) {
    return this.financial.syncServiceOrder(actor, body);
  }

  @Post('sync/purchase-order')
  @RequirePermission(Permission.FINANCE_WRITE)
  syncPurchaseOrder(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(syncPurchaseFinancialSchema)) body: SyncPurchaseFinancialInput,
  ) {
    return this.financial.syncPurchaseOrder(actor, body);
  }
}
