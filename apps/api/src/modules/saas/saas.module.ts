import { Global, Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../tenants/platform-admin.guard';
import { QuotasService } from './quotas.service';
import { PlansService } from './plans.service';
import { PlatformPlansController } from './plans.controller';
import { QuotaController } from './quota.controller';

@Global()
@Module({
  controllers: [PlatformPlansController, QuotaController],
  providers: [QuotasService, PlansService, PlatformAdminGuard],
  exports: [QuotasService, PlansService],
})
export class SaasModule {}
