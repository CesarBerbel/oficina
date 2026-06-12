import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  generateQuoteSchema,
  Permission,
  type GenerateQuoteInput,
} from '@oficina/shared';
import { QuotesService } from './quotes.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ServiceOrderExceptionFilter } from '../service-orders/service-order-exception.filter';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('service-orders/:orderId/quote')
@UseFilters(ServiceOrderExceptionFilter)
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  @RequirePermission(Permission.OS_READ)
  get(@CurrentUser() actor: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.quotes.getByOrder(actor.tenantId, orderId);
  }

  @Post()
  @RequirePermission(Permission.QUOTES_WRITE)
  generate(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(generateQuoteSchema)) body: GenerateQuoteInput,
  ) {
    return this.quotes.generate(actor, orderId, body);
  }

  @Post('send-email')
  @RequirePermission(Permission.QUOTES_WRITE)
  sendEmail(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.quotes.sendEmail(actor, orderId);
  }

  @Post('reopen')
  @RequirePermission(Permission.QUOTES_WRITE)
  reopen(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.quotes.reopen(actor, orderId);
  }

  @Post('generate-purchase')
  @RequirePermission(Permission.QUOTES_WRITE)
  generatePurchase(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('orderId') orderId: string,
  ) {
    return this.quotes.generatePurchase(actor, orderId);
  }
}
