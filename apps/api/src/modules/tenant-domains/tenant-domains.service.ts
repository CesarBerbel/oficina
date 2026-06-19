import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  TENANT_DOMAIN_VERIFY_PREFIX,
  type CreateTenantDomainInput,
  type TenantDomainDto,
  type TenantDomainDnsCheckDto,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QuotasService } from '../saas/quotas.service';
import { DnsVerifier } from './dns-verifier.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class TenantDomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dns: DnsVerifier,
    private readonly quotas: QuotasService,
  ) {}

  /**
   * Domínios-base próprios (ex.: "meudominio.cloud") cujos subdomínios são
   * auto-verificados — não precisam de TXT, pois o DNS já é controlado por nós.
   * Outros domínios (de terceiros) seguem exigindo comprovação por TXT.
   */
  private autoVerifySuffixes(): string[] {
    return (process.env.TENANT_DOMAIN_AUTO_VERIFY_SUFFIXES ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  /** true se o domínio é (ou é subdomínio de) um domínio-base próprio. */
  private isAutoVerified(domain: string): boolean {
    const d = domain.toLowerCase();
    return this.autoVerifySuffixes().some((s) => d === s || d.endsWith(`.${s}`));
  }

  private normalizeHost(value: string | null | undefined): string | null {
    const raw = (value ?? '').trim().toLowerCase();
    if (!raw) return null;
    const withoutProtocol = raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const withoutPort = withoutProtocol.replace(/:\d+$/, '').replace(/\.$/, '');
    return withoutPort || null;
  }

  private staticOrigins(): Set<string> {
    const values = [process.env.WEB_ORIGIN, process.env.WEB_ORIGINS, process.env.APP_URL]
      .flatMap((v) => (v ?? '').split(','))
      .map((v) => v.trim().replace(/\/+$/, ''))
      .filter(Boolean);
    return new Set(values);
  }

  private toDto(d: {
    id: string;
    domain: string;
    isPrimary: boolean;
    status: 'PENDING' | 'VERIFIED' | 'FAILED';
    verificationToken: string;
    verifiedAt: Date | null;
    lastCheckedAt: Date | null;
    lastCheckError: string | null;
    createdAt: Date;
  }): TenantDomainDto {
    return {
      id: d.id,
      domain: d.domain,
      isPrimary: d.isPrimary,
      status: d.status,
      verified: d.verifiedAt != null && d.status === 'VERIFIED',
      verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
      lastCheckedAt: d.lastCheckedAt ? d.lastCheckedAt.toISOString() : null,
      lastCheckError: d.lastCheckError,
      createdAt: d.createdAt.toISOString(),
      // Subdomínio próprio: a UI esconde o passo do TXT.
      autoVerified: this.isAutoVerified(d.domain),
      verification: {
        name: `${TENANT_DOMAIN_VERIFY_PREFIX}.${d.domain}`,
        type: 'TXT',
        value: d.verificationToken,
      },
    };
  }

  /**
   * Porteiro do TLS on-demand (Caddy): true só se o domínio existe e está
   * verificado. Cross-tenant e sem auth — usado pelo `ask` antes de emitir cert.
   */
  async isAllowedForTls(domain: string): Promise<boolean> {
    const d = this.normalizeHost(domain);
    if (!d) return false;
    const found = await this.prisma.tenantDomain.findFirst({
      where: { domain: d, status: 'VERIFIED', verifiedAt: { not: null } },
      select: { id: true },
    });
    return found != null;
  }

  /** CORS dinâmico: origens estáticas + domínios customizados verificados. */
  async isAllowedOrigin(origin: string | undefined): Promise<boolean> {
    if (!origin) return true; // curl/server-to-server sem Origin
    const clean = origin.replace(/\/+$/, '');
    if (this.staticOrigins().has(clean)) return true;
    let host: string | null = null;
    try {
      host = this.normalizeHost(new URL(origin).host);
    } catch {
      return false;
    }
    if (!host) return false;
    return this.isAllowedForTls(host);
  }

  async list(tenantId: string): Promise<TenantDomainDto[]> {
    const rows = await this.prisma.tenantDomain.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(actor: AuthenticatedUser, input: CreateTenantDomainInput): Promise<TenantDomainDto> {
    const accountId = await this.quotas.accountIdForTenant(actor.tenantId);
    const currentDomains = await this.prisma.tenantDomain.count({
      where: { tenant: { accountId } },
    });
    await this.quotas.assertAccountLimit(accountId, 'CUSTOM_DOMAINS', currentDomains, 1);

    const isPrimary =
      (await this.prisma.tenantDomain.count({ where: { tenantId: actor.tenantId } })) === 0;
    const autoVerified = this.isAutoVerified(input.domain);
    try {
      const created = await this.prisma.tenantDomain.create({
        data: {
          tenantId: actor.tenantId,
          domain: input.domain,
          isPrimary,
          verificationToken: randomBytes(16).toString('hex'),
          // Subdomínio de domínio-base próprio já entra verificado.
          verifiedAt: autoVerified ? new Date() : null,
          status: autoVerified ? 'VERIFIED' : 'PENDING',
        },
      });
      await this.audit.record({
        tenantId: actor.tenantId,
        userId: actor.id,
        module: 'tenant-domains',
        action: 'create',
        entity: 'TenantDomain',
        entityId: created.id,
        after: { domain: created.domain },
      });
      return this.toDto(created);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Este domínio já está cadastrado.');
      }
      throw err;
    }
  }

  /**
   * Verifica a posse do domínio consultando o registro TXT
   * `_oficina-verify.<domain>` e comparando com o token gerado.
   */
  async verify(actor: AuthenticatedUser, id: string): Promise<TenantDomainDto> {
    const existing = await this.prisma.tenantDomain.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!existing) throw new NotFoundException('Domínio não encontrado');

    if (existing.verifiedAt && existing.status === 'VERIFIED') return this.toDto(existing);

    let lastCheckError: string | null = null;
    // Subdomínio próprio: dispensa o TXT. Demais domínios comprovam por TXT.
    if (!this.isAutoVerified(existing.domain)) {
      const host = `${TENANT_DOMAIN_VERIFY_PREFIX}.${existing.domain}`;
      const records = await this.dns.txtRecords(host);
      if (!records.includes(existing.verificationToken)) {
        lastCheckError = `TXT ausente em ${host}`;
        await this.prisma.tenantDomain.update({
          where: { id },
          data: { status: 'FAILED', lastCheckedAt: new Date(), lastCheckError },
        });
        throw new BadRequestException(
          `Registro TXT não encontrado. Crie um TXT em "${host}" com o valor "${existing.verificationToken}" e tente novamente (a propagação do DNS pode levar alguns minutos).`,
        );
      }
    }

    const updated = await this.prisma.tenantDomain.update({
      where: { id },
      data: {
        verifiedAt: new Date(),
        status: 'VERIFIED',
        lastCheckedAt: new Date(),
        lastCheckError,
      },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'tenant-domains',
      action: 'verify',
      entity: 'TenantDomain',
      entityId: id,
      after: { domain: updated.domain },
    });
    return this.toDto(updated);
  }

  /** Diagnóstico ao vivo do DNS (TXT de posse + apontamento A/AAAA/CNAME). */
  async dnsCheck(actor: AuthenticatedUser, id: string): Promise<TenantDomainDnsCheckDto> {
    const existing = await this.prisma.tenantDomain.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!existing) throw new NotFoundException('Domínio não encontrado');

    const txtName = `${TENANT_DOMAIN_VERIFY_PREFIX}.${existing.domain}`;
    const [txtFound, addresses] = await Promise.all([
      this.dns.txtRecords(txtName),
      this.dns.addresses(existing.domain),
    ]);
    const txtOk =
      this.isAutoVerified(existing.domain) || txtFound.includes(existing.verificationToken);
    const addressOk = addresses.length > 0;
    await this.prisma.tenantDomain.update({
      where: { id },
      data: {
        lastCheckedAt: new Date(),
        lastCheckError: txtOk && addressOk ? null : 'DNS ainda não está totalmente configurado.',
        status: existing.verifiedAt ? 'VERIFIED' : txtOk || addressOk ? 'PENDING' : 'FAILED',
      },
    });

    return {
      domain: existing.domain,
      verified: existing.verifiedAt != null || txtOk,
      txt: {
        name: txtName,
        expected: existing.verificationToken,
        found: txtFound,
        ok: txtOk,
      },
      address: {
        name: existing.domain,
        records: addresses,
        ok: addressOk,
      },
    };
  }

  async setPrimary(actor: AuthenticatedUser, id: string): Promise<TenantDomainDto> {
    const existing = await this.prisma.tenantDomain.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!existing) throw new NotFoundException('Domínio não encontrado');
    if (!existing.verifiedAt || existing.status !== 'VERIFIED') {
      throw new BadRequestException('Verifique o domínio antes de defini-lo como principal.');
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.tenantDomain.updateMany({
        where: { tenantId: actor.tenantId },
        data: { isPrimary: false },
      });
      return tx.tenantDomain.update({ where: { id }, data: { isPrimary: true } });
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'tenant-domains',
      action: 'set-primary',
      entity: 'TenantDomain',
      entityId: id,
      after: { domain: updated.domain },
    });
    return this.toDto(updated);
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const existing = await this.prisma.tenantDomain.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!existing) throw new NotFoundException('Domínio não encontrado');
    await this.prisma.tenantDomain.delete({ where: { id } });
    // Se removeu o primário e ainda há domínios verificados, promove o mais antigo.
    if (existing.isPrimary) {
      const next = await this.prisma.tenantDomain.findFirst({
        where: { tenantId: actor.tenantId, status: 'VERIFIED', verifiedAt: { not: null } },
        orderBy: { createdAt: 'asc' },
      });
      if (next) {
        await this.prisma.tenantDomain.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'tenant-domains',
      action: 'delete',
      entity: 'TenantDomain',
      entityId: id,
      before: { domain: existing.domain },
    });
  }
}
