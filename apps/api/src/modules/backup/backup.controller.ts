import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { BackupStatusDto } from '@oficina/shared';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';
import { BackupService } from './backup.service';

/** Backup do banco + uploads — restrito ao super admin da plataforma. */
@Controller('platform/backup')
@UseGuards(PlatformAdminGuard)
@AllowAuthenticated()
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('status')
  status(): Promise<BackupStatusDto> {
    return this.backup.status();
  }

  @Get('download')
  async download(@Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.backup.generate();
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);
  }
}
