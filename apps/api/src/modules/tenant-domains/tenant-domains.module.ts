import { Module } from '@nestjs/common';
import { TenantDomainsService } from './tenant-domains.service';
import { TenantDomainsController } from './tenant-domains.controller';

@Module({
  controllers: [TenantDomainsController],
  providers: [TenantDomainsService],
})
export class TenantDomainsModule {}
