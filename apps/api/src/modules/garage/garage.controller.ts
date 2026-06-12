import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  garageRequestCodeSchema,
  garageVerifyCodeSchema,
  type GarageRequestCodeInput,
  type GarageVerifyCodeInput,
} from '@oficina/shared';
import { GarageService } from './garage.service';
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

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-code')
  requestCode(
    @Body(new ZodValidationPipe(garageRequestCodeSchema))
    body: GarageRequestCodeInput,
  ) {
    return this.garage.requestCode(body.plate);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify')
  verify(
    @Body(new ZodValidationPipe(garageVerifyCodeSchema))
    body: GarageVerifyCodeInput,
  ) {
    return this.garage.verifyCode(body.plate, body.code);
  }

  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get()
  data(@Headers('authorization') auth?: string) {
    return this.garage.getData(auth);
  }
}
