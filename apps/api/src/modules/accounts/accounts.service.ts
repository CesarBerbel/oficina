import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { ProvisionAccountInput, ProvisionedAccountDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PasswordService } from '../../infra/security/password.service';
import { AuditService } from '../audit/audit.service';
import { seedMessageTemplates } from '../messaging/default-templates';
import { seedDefaultCategories } from '../categories/default-categories';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  /** Domínio-base da plataforma (ex.: saecbpa.com). Vazio = não cria subdomínio. */
  private baseDomain(): string | null {
    const v = (process.env.PLATFORM_BASE_DOMAIN ?? '').trim().toLowerCase();
    return v || null;
  }

  /**
   * Provisiona uma conta nova (cliente do SaaS): Account + oficina matriz + admin
   * (com senha temporária) + site + subdomínio auto-verificado. Só platform admin.
   */
  async provision(
    actor: AuthenticatedUser,
    input: ProvisionAccountInput,
  ): Promise<ProvisionedAccountDto> {
    const slug = input.slug.trim().toLowerCase();

    // Pré-checagem amigável (P2002 cobre corridas).
    const [accountClash, tenantClash] = await Promise.all([
      this.prisma.account.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } }),
    ]);
    if (accountClash || tenantClash) {
      throw new ConflictException('Já existe uma conta com esse identificador. Escolha outro.');
    }

    const tempPassword = randomBytes(9).toString('base64url'); // ~12 chars
    const passwordHash = await this.passwords.hash(tempPassword);
    const base = this.baseDomain();
    const domain = base ? `${slug}.${base}` : null;

    let result: { accountId: string; tenantId: string };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: { name: input.name, slug, status: 'ACTIVE' },
        });
        const tenant = await tx.tenant.create({
          data: {
            name: input.name,
            slug,
            cnpj: input.cnpj ?? null,
            parentId: null,
            accountId: account.id,
          },
        });
        await tx.user.create({
          data: {
            tenantId: tenant.id,
            name: input.adminName,
            email: input.adminEmail,
            passwordHash,
            role: 'ADMIN',
            active: true,
            superAdmin: false,
            // Senha temporária: troca obrigatória no primeiro login.
            forcePasswordChange: true,
          },
        });
        await tx.siteSettings.create({
          data: { tenantId: tenant.id, shopName: input.name, cnpj: input.cnpj ?? null },
        });
        if (domain) {
          // Subdomínio próprio da plataforma → já entra verificado (DNS é nosso).
          await tx.tenantDomain.create({
            data: {
              tenantId: tenant.id,
              domain,
              verificationToken: randomBytes(16).toString('hex'),
              verifiedAt: new Date(),
              isPrimary: true,
            },
          });
        }
        return { accountId: account.id, tenantId: tenant.id };
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já existe uma conta com esse identificador. Escolha outro.');
      }
      throw err;
    }

    // Dados padrão (best-effort, fora da transação — não bloqueiam o provisionamento).
    try {
      await seedDefaultCategories(this.prisma, result.tenantId);
      await seedMessageTemplates(this.prisma, result.tenantId);
    } catch (err) {
      this.logger.warn(
        `Falha ao semear dados padrão da conta ${result.accountId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'PROVISION_ACCOUNT',
      module: 'platform',
      entity: 'Account',
      entityId: result.accountId,
      after: { slug, domain },
    });

    return {
      account: { id: result.accountId, name: input.name, slug, status: 'ACTIVE' },
      tenant: { id: result.tenantId, slug },
      admin: { name: input.adminName, email: input.adminEmail },
      tempPassword,
      domain,
      loginUrl: domain ? `https://${domain}` : null,
    };
  }
}
