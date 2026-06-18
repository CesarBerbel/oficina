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
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DnsVerifier } from './dns-verifier.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class TenantDomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dns: DnsVerifier,
  ) {}

  private toDto(d: {
    id: string;
    domain: string;
    isPrimary: boolean;
    verificationToken: string;
    verifiedAt: Date | null;
    createdAt: Date;
  }): TenantDomainDto {
    return {
      id: d.id,
      domain: d.domain,
      isPrimary: d.isPrimary,
      verified: d.verifiedAt != null,
      verifiedAt: d.verifiedAt ? d.verifiedAt.toISOString() : null,
      createdAt: d.createdAt.toISOString(),
      verification: {
        name: `${TENANT_DOMAIN_VERIFY_PREFIX}.${d.domain}`,
        type: 'TXT',
        value: d.verificationToken,
      },
    };
  }

  async list(tenantId: string): Promise<TenantDomainDto[]> {
    const rows = await this.prisma.tenantDomain.findMany({
      where: { tenantId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(actor: AuthenticatedUser, input: CreateTenantDomainInput): Promise<TenantDomainDto> {
    const isPrimary =
      (await this.prisma.tenantDomain.count({ where: { tenantId: actor.tenantId } })) === 0;
    try {
      const created = await this.prisma.tenantDomain.create({
        data: {
          tenantId: actor.tenantId,
          domain: input.domain,
          isPrimary,
          verificationToken: randomBytes(16).toString('hex'),
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

    if (existing.verifiedAt) return this.toDto(existing);

    const host = `${TENANT_DOMAIN_VERIFY_PREFIX}.${existing.domain}`;
    const records = await this.dns.txtRecords(host);
    if (!records.includes(existing.verificationToken)) {
      throw new BadRequestException(
        `Registro TXT não encontrado. Crie um TXT em "${host}" com o valor "${existing.verificationToken}" e tente novamente (a propagação do DNS pode levar alguns minutos).`,
      );
    }

    const updated = await this.prisma.tenantDomain.update({
      where: { id },
      data: { verifiedAt: new Date() },
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

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const existing = await this.prisma.tenantDomain.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!existing) throw new NotFoundException('Domínio não encontrado');
    await this.prisma.tenantDomain.delete({ where: { id } });
    // Se removeu o primário e ainda há domínios, promove o mais antigo.
    if (existing.isPrimary) {
      const next = await this.prisma.tenantDomain.findFirst({
        where: { tenantId: actor.tenantId },
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
