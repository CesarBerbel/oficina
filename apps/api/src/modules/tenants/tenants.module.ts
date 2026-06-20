import { Module } from '@nestjs/common';
import { TenantsController } from './tenants.controller';
import { AccountTenantsController } from './account-tenants.controller';
import { TenantsService } from './tenants.service';
import { PlatformAdminGuard } from './platform-admin.guard';

@Module({
  controllers: [TenantsController, AccountTenantsController],
  providers: [TenantsService, PlatformAdminGuard],
})
export class TenantsModule {}
