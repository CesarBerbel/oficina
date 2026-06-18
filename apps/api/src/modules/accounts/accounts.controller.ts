import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { provisionAccountSchema, type ProvisionAccountInput } from '@oficina/shared';
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

  @Post()
  provision(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(provisionAccountSchema)) body: ProvisionAccountInput,
  ) {
    return this.accounts.provision(actor, body);
  }
}
