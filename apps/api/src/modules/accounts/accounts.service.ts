import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma, type AccountRequestStatus, type AccountStatus } from '@prisma/client';
import type {
  AccountDto,
  AccountRequestDto,
  CreateAccountRequestInput,
  PlatformOverviewDto,
  ProvisionAccountInput,
  ProvisionedAccountDto,
  ResetAdminPasswordDto,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PasswordService } from '../../infra/security/password.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
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
    private readonly auth: AuthService,
  ) {}

  /** Domínio-base da plataforma (ex.: saecbpa.com). Vazio = não cria subdomínio. */
  private baseDomain(): string | null {
    const v = (process.env.PLATFORM_BASE_DOMAIN ?? '').trim().toLowerCase();
    return v || null;
  }

  /**
   * Pedido público de criação de conta (landing). Fica PENDING até o platform
   * admin aprovar (Fase 1, PR 5). Recusa identificador já em uso/pendente.
   */
  async requestAccount(input: CreateAccountRequestInput): Promise<{ ok: true }> {
    const slug = input.slug.trim().toLowerCase();
    const [account, tenant, pending] = await Promise.all([
      this.prisma.account.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.tenant.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.accountRequest.findFirst({
        where: { slug, status: 'PENDING' },
        select: { id: true },
      }),
    ]);
    if (account || tenant || pending) {
      throw new ConflictException(
        'Este identificador já está em uso ou com pedido em andamento. Escolha outro.',
      );
    }
    await this.prisma.accountRequest.create({
      data: {
        name: input.name,
        slug,
        contactName: input.contactName,
        email: input.email,
        phone: input.phone ?? null,
        message: input.message ?? null,
      },
    });
    return { ok: true };
  }

  // ── Gestão pela plataforma (super admin) ─────────────────────────────────────

  /** Visão geral da plataforma (exclui a conta interna "plataforma"). */
  async overview(): Promise<PlatformOverviewDto> {
    const platformSlug = (process.env.PLATFORM_ACCOUNT_SLUG ?? 'plataforma').trim().toLowerCase();
    const [byStatus, pendingRequests, oficinas] = await Promise.all([
      this.prisma.account.groupBy({
        by: ['status'],
        where: { slug: { not: platformSlug } },
        _count: { _all: true },
      }),
      this.prisma.accountRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.tenant.count({ where: { account: { slug: { not: platformSlug } } } }),
    ]);
    const c = (s: string): number => byStatus.find((g) => g.status === s)?._count._all ?? 0;
    const active = c('ACTIVE');
    const suspended = c('SUSPENDED');
    const pending = c('PENDING');
    return {
      accounts: { total: active + suspended + pending, active, suspended, pending },
      pendingRequests,
      oficinas,
    };
  }

  private requestToDto(r: {
    id: string;
    name: string;
    slug: string;
    contactName: string;
    email: string;
    phone: string | null;
    message: string | null;
    status: AccountRequestStatus;
    createdAt: Date;
  }): AccountRequestDto {
    return {
      id: r.id,
      name: r.name,
      slug: r.slug,
      contactName: r.contactName,
      email: r.email,
      phone: r.phone,
      message: r.message,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /** Lista as contas (clientes do SaaS). */
  async listAccounts(): Promise<AccountDto[]> {
    const platformSlug = (process.env.PLATFORM_ACCOUNT_SLUG ?? 'plataforma').trim().toLowerCase();
    const rows = await this.prisma.account.findMany({
      where: { slug: { not: platformSlug } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        planRef: { select: { id: true, code: true, name: true } },
        _count: { select: { tenants: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      status: r.status,
      plan: r.planRef
        ? { id: r.planRef.id, code: r.planRef.code, name: r.planRef.name }
        : { id: null, code: null, name: null },
      oficinasCount: r._count.tenants,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Ativa/suspende uma conta. */
  async setAccountStatus(
    actor: AuthenticatedUser,
    id: string,
    status: 'ACTIVE' | 'SUSPENDED',
  ): Promise<AccountDto> {
    const exists = await this.prisma.account.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Conta não encontrada');
    const updated = await this.prisma.account.update({
      where: { id },
      data: { status: status as AccountStatus },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        createdAt: true,
        planRef: { select: { id: true, code: true, name: true } },
        _count: { select: { tenants: true } },
      },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: status === 'SUSPENDED' ? 'SUSPEND_ACCOUNT' : 'ACTIVATE_ACCOUNT',
      module: 'platform',
      entity: 'Account',
      entityId: id,
    });
    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      status: updated.status,
      plan: updated.planRef
        ? { id: updated.planRef.id, code: updated.planRef.code, name: updated.planRef.name }
        : { id: null, code: null, name: null },
      oficinasCount: updated._count.tenants,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  /**
   * Reseta a senha do admin da conta, gerando uma nova senha temporária (super
   * admin). Invalida as sessões ativas do admin e força a troca no próximo login.
   */
  async resetAdminPassword(
    actor: AuthenticatedUser,
    accountId: string,
  ): Promise<ResetAdminPasswordDto> {
    const platformSlug = (process.env.PLATFORM_ACCOUNT_SLUG ?? 'plataforma').trim().toLowerCase();
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { id: true, slug: true },
    });
    if (!account) throw new NotFoundException('Conta não encontrada');
    if (account.slug === platformSlug) {
      throw new ConflictException('A conta da plataforma não é gerenciada por aqui.');
    }

    // Admin "dono" da conta: o ADMIN mais antigo (criado no provisionamento).
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN', tenant: { accountId } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, email: true },
    });
    if (!admin) throw new NotFoundException('Esta conta não possui um administrador.');

    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await this.passwords.hash(tempPassword);
    await this.prisma.user.update({
      where: { id: admin.id },
      data: {
        passwordHash,
        forcePasswordChange: true,
        active: true,
        // Invalida as sessões atuais do admin (precisa entrar de novo).
        sessionVersion: { increment: 1 },
      },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'RESET_ACCOUNT_ADMIN_PASSWORD',
      module: 'platform',
      entity: 'User',
      entityId: admin.id,
      after: { accountId, adminEmail: admin.email },
    });

    return { adminName: admin.name, adminEmail: admin.email, tempPassword };
  }

  /** Lista pedidos de conta (opcionalmente por status). */
  async listRequests(status?: AccountRequestStatus): Promise<AccountRequestDto[]> {
    const rows = await this.prisma.accountRequest.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map((r) => this.requestToDto(r));
  }

  /** Aprova um pedido pendente → provisiona a conta e marca como APPROVED. */
  async approveRequest(actor: AuthenticatedUser, id: string): Promise<ProvisionedAccountDto> {
    const req = await this.prisma.accountRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Pedido não encontrado');
    if (req.status !== 'PENDING') throw new ConflictException('Pedido já processado.');

    // Se o provisionamento falhar (ex.: slug ficou indisponível), o pedido
    // permanece PENDING e o erro é propagado.
    const result = await this.provision(actor, {
      name: req.name,
      slug: req.slug,
      adminName: req.contactName,
      adminEmail: req.email,
    });
    await this.prisma.accountRequest.update({ where: { id }, data: { status: 'APPROVED' } });

    // Avisa o solicitante e envia um link seguro de "definir senha" para o 1º
    // acesso. Best-effort: a conta já foi provisionada, então uma falha de e-mail
    // não deve derrubar a aprovação (o admin ainda tem a senha temporária).
    try {
      const admin = await this.prisma.user.findUnique({
        where: { tenantId_email: { tenantId: result.tenant.id, email: req.email } },
        select: { id: true },
      });
      if (admin) {
        await this.auth.sendAccountWelcomeLink({
          userId: admin.id,
          email: req.email,
          name: req.contactName,
          accountName: req.name,
          slug: req.slug,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Conta ${result.account.slug} provisionada, mas falhou o e-mail de boas-vindas: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    return result;
  }

  /** Recusa um pedido pendente. */
  async rejectRequest(actor: AuthenticatedUser, id: string): Promise<{ ok: true }> {
    const res = await this.prisma.accountRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED' },
    });
    if (res.count === 0) throw new NotFoundException('Pedido não encontrado ou já processado');
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'REJECT_ACCOUNT_REQUEST',
      module: 'platform',
      entity: 'AccountRequest',
      entityId: id,
    });
    return { ok: true };
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
        const defaultPlan = await tx.plan.findFirst({
          where: { code: 'starter', active: true },
          select: { id: true, code: true },
        });
        const account = await tx.account.create({
          data: {
            name: input.name,
            slug,
            status: 'ACTIVE',
            plan: defaultPlan?.code ?? null,
            planId: defaultPlan?.id ?? null,
          },
        });
        if (defaultPlan) {
          await tx.accountSubscription.create({
            data: {
              accountId: account.id,
              planId: defaultPlan.id,
              status: 'ACTIVE',
              currentPeriodStart: new Date(),
            },
          });
        }
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
              status: 'VERIFIED',
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
