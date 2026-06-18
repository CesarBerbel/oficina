import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TenantDomainsService } from './tenant-domains.service';
import type { DnsVerifier } from './dns-verifier.service';
import type { PrismaService } from '../../infra/prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const actor = { id: 'u1', tenantId: 't1' } as AuthenticatedUser;

function build(opts: { domainRow: Record<string, unknown> | null; txt: string[] }) {
  const update = jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
    ...(opts.domainRow as object),
    ...data,
  }));
  const prisma = {
    tenantDomain: {
      findFirst: jest.fn().mockResolvedValue(opts.domainRow),
      update,
    },
  } as unknown as PrismaService;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const dns = { txtRecords: jest.fn().mockResolvedValue(opts.txt) } as unknown as DnsVerifier;
  return { service: new TenantDomainsService(prisma, audit, dns), update, dns };
}

const baseRow = {
  id: 'd1',
  domain: 'oficina.com.br',
  isPrimary: true,
  verificationToken: 'tok-abc123',
  verifiedAt: null as Date | null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('TenantDomainsService.verify (DNS)', () => {
  it('lança NotFound quando o domínio não existe', async () => {
    const { service } = build({ domainRow: null, txt: [] });
    await expect(service.verify(actor, 'x')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('verifica quando o TXT contém o token', async () => {
    const { service, update, dns } = build({ domainRow: { ...baseRow }, txt: ['tok-abc123'] });
    const dto = await service.verify(actor, 'd1');
    expect(dns.txtRecords).toHaveBeenCalledWith('_oficina-verify.oficina.com.br');
    expect(update).toHaveBeenCalled();
    expect(dto.verified).toBe(true);
  });

  it('falha (400) quando o TXT não tem o token', async () => {
    const { service, update } = build({ domainRow: { ...baseRow }, txt: ['outro-valor'] });
    await expect(service.verify(actor, 'd1')).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('é idempotente quando já verificado (não consulta DNS)', async () => {
    const { service, dns } = build({
      domainRow: { ...baseRow, verifiedAt: new Date('2026-02-02T00:00:00Z') },
      txt: [],
    });
    const dto = await service.verify(actor, 'd1');
    expect(dto.verified).toBe(true);
    expect(dns.txtRecords).not.toHaveBeenCalled();
  });
});
