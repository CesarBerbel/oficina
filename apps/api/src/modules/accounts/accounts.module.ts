import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';

@Module({
  controllers: [AccountsController],
  providers: [AccountsService, PlatformAdminGuard],
})
export class AccountsModule {}
