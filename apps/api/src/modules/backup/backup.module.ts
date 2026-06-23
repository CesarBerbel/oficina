import { Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';

@Module({
  controllers: [BackupController],
  providers: [BackupService, PlatformAdminGuard],
})
export class BackupModule {}
