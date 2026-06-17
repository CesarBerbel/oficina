import { Body, Controller, Get, Param, Post, Req, UseFilters } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { quoteDecisionSchema, type QuoteDecisionInput } from '@oficina/shared';
import { PublicService } from './public.service';
import { QuotesService } from '../quotes/quotes.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { ServiceOrderExceptionFilter } from '../service-orders/service-order-exception.filter';

/**
 * Endpoints públicos (sem login) para o cliente acompanhar a OS pelo token.
 * Rate limit reforçado por serem expostos.
 */
@Controller('public/track')
@Public()
@UseFilters(ServiceOrderExceptionFilter)
export class PublicController {
  constructor(
    private readonly tracking: PublicService,
    private readonly quotes: QuotesService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':token')
  get(@Param('token') token: string) {
    return this.tracking.getTracking(token);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post(':token/quote-decision')
  decide(
    @Param('token') token: string,
    @Body(new ZodValidationPipe(quoteDecisionSchema)) body: QuoteDecisionInput,
    @Req() req: Request,
  ) {
    return this.quotes.applyDecisionByToken(token, body, {
      ip: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
