import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createAccountRequestSchema, type CreateAccountRequestInput } from '@oficina/shared';
import { AccountsService } from './accounts.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';

/** Pedido público de criação de conta (landing). Sem autenticação. */
@Controller('public/account-request')
@Public()
export class PublicAccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post()
  @HttpCode(201)
  request(
    @Body(new ZodValidationPipe(createAccountRequestSchema)) body: CreateAccountRequestInput,
  ) {
    return this.accounts.requestAccount(body);
  }
}
