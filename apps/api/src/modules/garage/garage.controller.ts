import { Body, Controller, Get, Headers, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  garageRequestCodeSchema,
  garageVerifyCodeSchema,
  quoteDecisionSchema,
  type GarageRequestCodeInput,
  type GarageVerifyCodeInput,
  type QuoteDecisionInput,
} from '@oficina/shared';
import { GarageService } from './garage.service';
import type { PublicTenantLookup } from '../site/site.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';

/**
 * Área do cliente (sem login): consulta do histórico do veículo pela placa,
 * com verificação por código de 6 dígitos enviado ao e-mail do dono.
 * Endpoints públicos com rate limit reforçado.
 */
@Controller('public/garage')
@Public()
export class GarageController {
  constructor(private readonly garage: GarageService) {}

  private firstHeader(value: string | string[] | undefined): string | null {
    return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
  }

  private lookup(req: Request): PublicTenantLookup {
    const querySlug = typeof req.query.tenantSlug === 'string' ? req.query.tenantSlug : null;
    // Em produção (ou com PUBLIC_STRICT_HOST=true), ignora qualquer override de
    // oficina (tenantSlug/x-public-*): resolve só pelo host real.
    const allowOverrides =
      process.env.NODE_ENV !== 'production' && process.env.PUBLIC_STRICT_HOST !== 'true';
    return {
      tenantSlug: allowOverrides
        ? (querySlug ?? this.firstHeader(req.headers['x-public-tenant-slug']))
        : null,
      host:
        (allowOverrides ? this.firstHeader(req.headers['x-public-host']) : null) ??
        this.firstHeader(req.headers['x-forwarded-host']) ??
        req.get('host') ??
        null,
    };
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-code')
  requestCode(
    @Req() req: Request,
    @Body(new ZodValidationPipe(garageRequestCodeSchema))
    body: GarageRequestCodeInput,
  ) {
    return this.garage.requestCode(body.plate, this.lookup(req));
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  verify(
    @Req() req: Request,
    @Body(new ZodValidationPipe(garageVerifyCodeSchema))
    body: GarageVerifyCodeInput,
  ) {
    return this.garage.verifyCode(body.plate, body.code, this.lookup(req));
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  data(@Headers('authorization') auth?: string) {
    return this.garage.getData(auth);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('orders/:orderId/quote-decision')
  decideQuote(
    @Headers('authorization') auth: string | undefined,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(quoteDecisionSchema)) body: QuoteDecisionInput,
    @Req() req: Request,
  ) {
    return this.garage.decideQuote(auth, orderId, body, {
      ip: req.ip ?? req.socket?.remoteAddress ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }
}
