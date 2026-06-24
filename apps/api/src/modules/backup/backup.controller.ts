import { Controller, Get, Logger, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import archiver from 'archiver';
import type { BackupStatusDto } from '@oficina/shared';
import { AllowAuthenticated } from '../../common/decorators/allow-authenticated.decorator';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';
import { BackupService } from './backup.service';

/** Backup do banco + uploads — restrito ao super admin da plataforma. */
@Controller('platform/backup')
@UseGuards(PlatformAdminGuard)
@AllowAuthenticated()
export class BackupController {
  private readonly logger = new Logger(BackupController.name);

  constructor(private readonly backup: BackupService) {}

  @Get('status')
  status(): Promise<BackupStatusDto> {
    return this.backup.status();
  }

  @Get('download')
  async download(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${this.backup.filename()}"`);

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.on('warning', (err) => this.logger.warn(`archiver: ${err.message}`));
    archive.on('error', (err) => res.destroy(err));
    archive.pipe(res);

    try {
      await this.backup.streamTo(archive);
    } catch (err) {
      // Stream já iniciado: só dá para abortar a conexão (download truncado).
      if (res.headersSent) {
        res.destroy(err as Error);
        return;
      }
      throw err;
    }
  }
}
