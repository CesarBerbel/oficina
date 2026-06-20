import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import {
  createAccountBranchSchema,
  renameTenantSchema,
  type CreateAccountBranchInput,
  type RenameTenantInput,
} from '@oficina/shared';
import { TenantsService } from './tenants.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

/**
 * Gestão das oficinas pela própria CONTA (admin geral). Listar é liberado a
 * qualquer usuário logado da conta; criar/renomear é só do admin geral (matriz),
 * validado no service.
 */
@Controller('account/tenants')
@AllowAuthenticated()
export class AccountTenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser) {
    return this.tenants.listForAccount(actor.accountId);
  }

  @Post()
  @HttpCode(201)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createAccountBranchSchema)) body: CreateAccountBranchInput,
  ) {
    return this.tenants.createAccountBranch(actor, body);
  }

  @Patch(':id')
  rename(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(renameTenantSchema)) body: RenameTenantInput,
  ) {
    return this.tenants.renameTenant(actor, id, body);
  }
}
