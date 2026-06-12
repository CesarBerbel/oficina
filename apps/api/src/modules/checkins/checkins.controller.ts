import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  createCheckinSchema,
  listCheckinsQuerySchema,
  Permission,
  type CreateCheckinInput,
  type ListCheckinsQuery,
} from '@oficina/shared';
import { CheckinsService } from './checkins.service';
import { PdfService } from '../pdf/pdf.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('checkins')
export class CheckinsController {
  constructor(
    private readonly checkins: CheckinsService,
    private readonly pdf: PdfService,
  ) {}

  @Get()
  @RequirePermission(Permission.VEHICLES_READ)
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query(new ZodValidationPipe(listCheckinsQuerySchema))
    query: ListCheckinsQuery,
  ) {
    return this.checkins.list(actor.tenantId, query);
  }

  @Get(':id')
  @RequirePermission(Permission.VEHICLES_READ)
  findOne(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    return this.checkins.findOne(actor.tenantId, id);
  }

  @Get(':id/pdf')
  @RequirePermission(Permission.VEHICLES_READ)
  async pdfDownload(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.pdf.checkinPdf(actor.tenantId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }

  @Post()
  @RequirePermission(Permission.CHECKINS_WRITE)
  create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body(new ZodValidationPipe(createCheckinSchema)) body: CreateCheckinInput,
  ) {
    return this.checkins.create(actor, body);
  }
}
