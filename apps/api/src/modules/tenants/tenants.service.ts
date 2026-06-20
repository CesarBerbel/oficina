import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  CreateAccountBranchInput,
  CreateBranchInput,
  CreatedBranchDto,
  PlatformTenantDto,
  RenameTenantInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PasswordService } from '../../infra/security/password.service';
import { AuditService } from '../audit/audit.service';
import { QuotasService } from '../saas/quotas.service';
import { seedMessageTemplates } from '../messaging/default-templates';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const SELECT = {
  id: true,
  name: true,
  slug: true,
  cnpj: true,
  active: true,
  parentId: true,
  createdAt: true,
  _count: { select: { users: true, serviceOrders: true } },
} as const;

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  active: boolean;
  parentId: string | null;
  createdAt: Date;
  _count: { users: number; serviceOrders: number };
};

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly quotas: QuotasService,
  ) {}

  private toDto(t: TenantRow): PlatformTenantDto {
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      cnpj: t.cnpj,
      active: t.active,
      parentId: t.parentId,
      isMatriz: t.parentId === null,
      usersCount: t._count.users,
      serviceOrdersCount: t._count.serviceOrders,
      createdAt: t.createdAt.toISOString(),
    };
  }

  async list(): Promise<PlatformTenantDto[]> {
    // A conta interna "plataforma" (lar do super admin) não é uma oficina.
    const platformSlug = (process.env.PLATFORM_ACCOUNT_SLUG ?? 'plataforma').trim().toLowerCase();
    const rows = await this.prisma.tenant.findMany({
      where: { account: { slug: { not: platformSlug } } },
      // Matriz primeiro, depois filiais; mais antigas primeiro dentro de cada grupo.
      orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      select: SELECT,
    });
    return rows.map((r) => this.toDto(r));
  }

  // ── Gestão pelo ADMIN GERAL da própria conta ─────────────────────────────────

  /** Só o admin geral (ADMIN na matriz; groupId === tenantId) gerencia oficinas. */
  private assertGeneralAdmin(actor: AuthenticatedUser): void {
    if (!(actor.role === 'ADMIN' && actor.tenantId === actor.groupId)) {
      throw new ForbiddenException(
        'Apenas o administrador geral da conta pode gerenciar oficinas.',
      );
    }
  }

  /** Lista as oficinas (matriz + filiais) da conta. */
  async listForAccount(accountId: string): Promise<PlatformTenantDto[]> {
    const rows = await this.prisma.tenant.findMany({
      where: { accountId },
      orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
      select: SELECT,
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Cria uma filial na conta do admin geral, com admin próprio (senha temporária). */
  async createAccountBranch(
    actor: AuthenticatedUser,
    input: CreateAccountBranchInput,
  ): Promise<CreatedBranchDto> {
    this.assertGeneralAdmin(actor);
    const accountId = actor.accountId;
    const matrizId = actor.tenantId; // o admin geral está na matriz

    const branchCount = await this.prisma.tenant.count({ where: { accountId } });
    await this.quotas.assertAccountLimit(accountId, 'BRANCHES', branchCount, 1);

    const slug = input.slug.trim().toLowerCase();
    const tempPassword = randomBytes(9).toString('base64url');
    const passwordHash = await this.passwords.hash(tempPassword);

    let createdId: string;
    try {
      const tenant = await this.prisma.$transaction(async (tx) => {
        const branch = await tx.tenant.create({
          data: {
            name: input.shopName,
            slug,
            cnpj: input.cnpj ?? null,
            parentId: matrizId,
            accountId,
          },
        });
        await tx.user.create({
          data: {
            tenantId: branch.id,
            name: input.adminName,
            email: input.adminEmail,
            passwordHash,
            role: 'ADMIN',
            active: true,
            superAdmin: false,
            forcePasswordChange: true,
          },
        });
        await tx.siteSettings.create({
          data: { tenantId: branch.id, shopName: input.shopName, cnpj: input.cnpj ?? null },
        });
        return branch;
      });
      createdId = tenant.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já existe uma oficina com esse identificador. Escolha outro.');
      }
      throw err;
    }

    try {
      await seedMessageTemplates(this.prisma, createdId);
    } catch {
      /* não bloqueia a criação da filial */
    }

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE_BRANCH',
      module: 'account',
      entity: 'Tenant',
      entityId: createdId,
    });

    const created = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: createdId },
      select: SELECT,
    });
    return {
      tenant: this.toDto(created),
      admin: { name: input.adminName, email: input.adminEmail },
      tempPassword,
    };
  }

  /** Renomeia (nome + slug) uma oficina da própria conta. Matriz continua matriz. */
  async renameTenant(
    actor: AuthenticatedUser,
    tenantId: string,
    input: RenameTenantInput,
  ): Promise<PlatformTenantDto> {
    this.assertGeneralAdmin(actor);
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, accountId: true },
    });
    if (!tenant || tenant.accountId !== actor.accountId) {
      throw new NotFoundException('Oficina não encontrada');
    }
    const slug = input.slug.trim().toLowerCase();
    try {
      const updated = await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { name: input.name, slug },
        select: SELECT,
      });
      await this.audit.record({
        tenantId: actor.tenantId,
        userId: actor.id,
        action: 'RENAME_TENANT',
        module: 'account',
        entity: 'Tenant',
        entityId: tenantId,
        after: { name: input.name, slug },
      });
      return this.toDto(updated);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já existe uma oficina com esse identificador. Escolha outro.');
      }
      throw err;
    }
  }

  /** Cria uma filial sob a matriz do grupo do super usuário. */
  async createBranch(
    actor: AuthenticatedUser,
    input: CreateBranchInput,
  ): Promise<PlatformTenantDto> {
    const me = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { id: true, parentId: true, accountId: true },
    });
    // A filial sempre fica sob a matriz (raiz). Se o super usuário já estiver numa
    // filial, sobe para a matriz dela.
    const matrizId = me?.parentId ?? actor.tenantId;
    // A filial herda a conta da matriz/grupo.
    const accountId = me?.accountId ?? actor.accountId;

    const branchCount = await this.prisma.tenant.count({ where: { accountId } });
    await this.quotas.assertAccountLimit(accountId, 'BRANCHES', branchCount, 1);

    const slug = input.slug.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(input.password);

    let createdId: string;
    try {
      const tenant = await this.prisma.$transaction(async (tx) => {
        const branch = await tx.tenant.create({
          data: {
            name: input.shopName,
            slug,
            cnpj: input.cnpj ?? null,
            parentId: matrizId,
            accountId,
          },
        });
        await tx.user.create({
          data: {
            tenantId: branch.id,
            name: input.adminName,
            email: input.adminEmail,
            passwordHash,
            role: 'ADMIN',
            active: true,
            superAdmin: false,
            forcePasswordChange: false,
          },
        });
        await tx.siteSettings.create({
          data: {
            tenantId: branch.id,
            shopName: input.shopName,
            cnpj: input.cnpj ?? null,
          },
        });
        return branch;
      });
      createdId = tenant.id;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Já existe uma oficina com esse identificador. Escolha outro.');
      }
      throw err;
    }

    // Categorias/marcas são compartilhadas do grupo (matriz) — a filial não semeia
    // as suas. Apenas os templates de mensagem são por filial.
    try {
      await seedMessageTemplates(this.prisma, createdId);
    } catch {
      /* não bloqueia a criação da filial */
    }

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE_BRANCH',
      module: 'platform',
      entity: 'Tenant',
      entityId: createdId,
    });

    const created = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: createdId },
      select: SELECT,
    });
    return this.toDto(created);
  }

  async setActive(
    actor: AuthenticatedUser,
    id: string,
    active: boolean,
  ): Promise<PlatformTenantDto> {
    const exists = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new NotFoundException('Oficina não encontrada');

    const updated = await this.prisma.tenant.update({
      where: { id },
      data: { active },
      select: SELECT,
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: active ? 'ACTIVATE_TENANT' : 'DEACTIVATE_TENANT',
      module: 'platform',
      entity: 'Tenant',
      entityId: id,
    });
    return this.toDto(updated);
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<{ ok: true }> {
    if (id === actor.tenantId) {
      throw new BadRequestException('Você não pode excluir a própria oficina.');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        parentId: true,
        _count: { select: { branches: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Oficina não encontrada');
    if (tenant.parentId === null && tenant._count.branches > 0) {
      throw new BadRequestException('Esta é a matriz e possui filiais. Exclua as filiais antes.');
    }

    await this.prisma.tenant.delete({ where: { id } });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'DELETE_TENANT',
      module: 'platform',
      entity: 'Tenant',
      entityId: id,
      after: { name: tenant.name },
    });
    return { ok: true };
  }
}
