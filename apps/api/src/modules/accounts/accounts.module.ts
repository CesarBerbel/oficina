import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { PublicAccountsController } from './public-accounts.controller';
import { AccountsService } from './accounts.service';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AccountsController, PublicAccountsController],
  providers: [AccountsService, PlatformAdminGuard],
})
export class AccountsModule {}
