import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PlatformTenantDto } from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const SELECT = {
  id: true,
  name: true,
  slug: true,
  cnpj: true,
  active: true,
  createdAt: true,
  _count: { select: { users: true, serviceOrders: true } },
} as const;

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  active: boolean;
  createdAt: Date;
  _count: { users: number; serviceOrders: number };
};

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toDto(t: TenantRow): PlatformTenantDto {
    return {
      id: t.id,
      name: t.name,
      slug: t.slug,
      cnpj: t.cnpj,
      active: t.active,
      usersCount: t._count.users,
      serviceOrdersCount: t._count.serviceOrders,
      createdAt: t.createdAt.toISOString(),
    };
  }

  async list(): Promise<PlatformTenantDto[]> {
    const rows = await this.prisma.tenant.findMany({
      orderBy: { createdAt: 'desc' },
      select: SELECT,
    });
    return rows.map((r) => this.toDto(r));
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
      select: { id: true, name: true },
    });
    if (!tenant) throw new NotFoundException('Oficina não encontrada');

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
