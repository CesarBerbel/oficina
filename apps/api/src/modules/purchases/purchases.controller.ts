import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createPurchaseSchema,
  listPurchasesQuerySchema,
  receivePurchaseSchema,
  Permission,
  type CreatePurchaseInput,
  type ListPurchasesQuery,
  type ReceivePurchaseInput,
} from '@oficina/shared';
import { z } from 'zod';
import { PurchasesService } from './purchases.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const statusSchema = z.object({ status: z.enum(['ENVIADO', 'CANCELADO']) });

@Controller('purchase-orders')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  @RequirePermission(Permission.PURCHASES_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listPurchasesQuerySchema))
    query: ListPurchasesQuery,
  ) {
    return this.purchases.list(actor.tenantId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.PURCHASES_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.purchases.findOne(actor.tenantId, id);
  }

  @Post()
  @RequirePermission(Permission.PURCHASES_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createPurchaseSchema)) body: CreatePurchaseInput,
  ) {
    return this.purchases.create(actor, body);
  }

  @Post('from-shortages')
  @RequirePermission(Permission.PURCHASES_WRITE)
  fromShortages(@CurrentUser() actor: AuthenticatedUser) {
    return this.purchases.createFromShortages(actor);
  }

  @Post(':id/status')
  @RequirePermission(Permission.PURCHASES_WRITE)
  setStatus(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(statusSchema)) body: { status: 'ENVIADO' | 'CANCELADO' },
  ) {
    return this.purchases.setStatus(actor, id, body.status);
  }

  @Post(':id/receive')
  @RequirePermission(Permission.PURCHASES_WRITE)
  receive(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(receivePurchaseSchema)) body: ReceivePurchaseInput,
  ) {
    return this.purchases.receive(actor, id, body);
  }

  @Post(':id/receive-nfe')
  @RequirePermission(Permission.PURCHASES_WRITE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }),
  )
  receiveNfe(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Envie o XML (ou ZIP) da NF-e');
    return this.purchases.receiveFromNfe(actor, id, file.buffer, file.originalname);
  }
}
