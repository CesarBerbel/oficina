import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import type { AccountRequestStatus } from '@prisma/client';
import {
  provisionAccountSchema,
  updateAccountStatusSchema,
  type ProvisionAccountInput,
  type UpdateAccountStatusInput,
} from '@oficina/shared';
import { AccountsService } from './accounts.service';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/** Gestão de contas do SaaS — restrito ao super usuário da plataforma. */
@Controller('platform/accounts')
@UseGuards(PlatformAdminGuard)
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  list() {
    return this.accounts.listAccounts();
  }

  @Post()
  provision(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(provisionAccountSchema)) body: ProvisionAccountInput,
  ) {
    return this.accounts.provision(actor, body);
  }

  @Get('requests')
  listRequests(@Query('status') status?: AccountRequestStatus) {
    return this.accounts.listRequests(status);
  }

  @Post('requests/:id/approve')
  approve(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.accounts.approveRequest(actor, id);
  }

  @Post('requests/:id/reject')
  reject(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.accounts.rejectRequest(actor, id);
  }

  @Patch(':id/status')
  setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateAccountStatusSchema)) body: UpdateAccountStatusInput,
  ) {
    return this.accounts.setAccountStatus(actor, id, body.status);
  }
}
