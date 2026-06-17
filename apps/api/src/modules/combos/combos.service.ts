import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ComboDto,
  CreateComboInput,
  ListCombosQuery,
  Paginated,
  UpdateComboInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

const include = {
  services: {
    orderBy: { position: 'asc' },
    include: { service: { select: { id: true, name: true, salePrice: true } } },
  },
} satisfies Prisma.ComboInclude;

type ComboRow = Prisma.ComboGetPayload<{ include: typeof include }>;

function toDto(c: ComboRow): ComboDto {
  const services = c.services.map((cs) => ({
    serviceId: cs.service.id,
    serviceName: cs.service.name,
    salePrice: dec(cs.service.salePrice),
  }));
  return {
    id: c.id,
    name: c.name,
    description: c.description,
    active: c.active,
    services,
    total: services.reduce((acc, s) => acc + s.salePrice, 0),
  };
}

@Injectable()
export class CombosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Combos (catálogo) são compartilhados no grupo: escopo por groupId.
  private async assertServices(
    groupId: string,
    serviceIds: string[],
  ): Promise<void> {
    const count = await this.prisma.service.count({
      where: { tenantId: groupId, id: { in: serviceIds } },
    });
    if (count !== new Set(serviceIds).size) {
      throw new BadRequestException('Um ou mais serviços do combo são inválidos');
    }
  }

  async list(
    groupId: string,
    query: ListCombosQuery,
  ): Promise<Paginated<ComboDto>> {
    const { page, pageSize, search } = query;
    const where: Prisma.ComboWhereInput = {
      tenantId: groupId,
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.combo.count({ where }),
      this.prisma.combo.findMany({
        where,
        include,
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows.map(toDto),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async findOne(groupId: string, id: string): Promise<ComboDto> {
    const combo = await this.prisma.combo.findFirst({
      where: { id, tenantId: groupId },
      include,
    });
    if (!combo) throw new NotFoundException('Combo não encontrado');
    return toDto(combo);
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateComboInput,
  ): Promise<ComboDto> {
    await this.assertServices(actor.groupId, input.serviceIds);

    const created = await this.prisma.combo.create({
      data: {
        tenantId: actor.groupId,
        name: input.name,
        description: input.description ?? null,
        active: input.active,
        services: {
          create: input.serviceIds.map((serviceId, position) => ({
            serviceId,
            position,
          })),
        },
      },
      include,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'combos',
      entity: 'Combo',
      entityId: created.id,
      after: { name: created.name },
    });

    return toDto(created);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateComboInput,
  ): Promise<ComboDto> {
    const current = await this.prisma.combo.findFirst({
      where: { id, tenantId: actor.groupId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Combo não encontrado');

    if (input.serviceIds) {
      await this.assertServices(actor.groupId, input.serviceIds);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.combo.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description ?? null }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        },
      });
      if (input.serviceIds) {
        await tx.comboService.deleteMany({ where: { comboId: id } });
        await tx.comboService.createMany({
          data: input.serviceIds.map((serviceId, position) => ({
            comboId: id,
            serviceId,
            position,
          })),
        });
      }
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'combos',
      entity: 'Combo',
      entityId: id,
    });

    return this.findOne(actor.groupId, id);
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const current = await this.prisma.combo.findFirst({
      where: { id, tenantId: actor.groupId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Combo não encontrado');

    await this.prisma.combo.delete({ where: { id } });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'DELETE',
      module: 'combos',
      entity: 'Combo',
      entityId: id,
    });
  }
}
