import { Controller, Get, NotFoundException, Query } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { TenantDomainsService } from './tenant-domains.service';

/**
 * Porteiro do TLS on-demand (Caddy). O `on_demand_tls { ask ... }` chama este
 * endpoint antes de emitir um certificado: respondemos 200 apenas para domínios
 * de oficina já verificados, e 404 para o resto — evitando abuso e o rate limit
 * do Let's Encrypt. É público (o Caddy chama sem auth) e só revela se um domínio
 * está verificado.
 */
@Controller('internal')
export class TlsCheckController {
  constructor(private readonly domains: TenantDomainsService) {}

  @Public()
  @Get('tls-check')
  async check(@Query('domain') domain?: string): Promise<{ ok: true }> {
    if (!domain || !(await this.domains.isAllowedForTls(domain))) {
      throw new NotFoundException('Domínio não autorizado');
    }
    return { ok: true };
  }
}
