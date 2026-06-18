import { Module } from '@nestjs/common';
import { TenantDomainsService } from './tenant-domains.service';
import { TenantDomainsController } from './tenant-domains.controller';
import { DnsVerifier } from './dns-verifier.service';

@Module({
  controllers: [TenantDomainsController],
  providers: [TenantDomainsService, DnsVerifier],
})
export class TenantDomainsModule {}
