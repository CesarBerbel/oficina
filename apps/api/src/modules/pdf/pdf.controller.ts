import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Permission } from '@oficina/shared';
import { PdfService } from './pdf.service';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Controller('service-orders')
export class PdfController {
  constructor(private readonly pdf: PdfService) {}

  @Get(':id/pdf')
  @RequirePermission(Permission.OS_READ)
  async download(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.pdf.serviceOrderPdf(actor.tenantId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(buffer);
  }
}
