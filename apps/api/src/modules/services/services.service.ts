import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateServiceInput,
  ListServicesQuery,
  Paginated,
  ServiceDto,
  UpdateServiceInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

const include = {
  defaultParts: {
    include: { part: { select: { name: true, unit: true } } },
  },
} satisfies Prisma.ServiceInclude;

type ServiceRow = Prisma.ServiceGetPayload<{ include: typeof include }>;

function toDto(s: ServiceRow): ServiceDto {
  return {
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    salePrice: dec(s.salePrice),
    cost: dec(s.cost),
    estimatedMinutes: s.estimatedMinutes,
    active: s.active,
    showOnSite: s.showOnSite,
    defaultParts: s.defaultParts.map((dp) => ({
      partId: dp.partId,
      partName: dp.part.name,
      unit: dp.part.unit,
      quantity: dec(dp.quantity),
    })),
  };
}

@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Serviços (catálogo) são compartilhados no grupo: escopo por groupId.
  private async assertParts(groupId: string, partIds: string[]): Promise<void> {
    if (partIds.length === 0) return;
    const count = await this.prisma.part.count({
      where: { tenantId: groupId, id: { in: partIds } },
    });
    if (count !== new Set(partIds).size) {
      throw new BadRequestException('Uma ou mais peças padrão são inválidas');
    }
  }

  async list(groupId: string, query: ListServicesQuery): Promise<Paginated<ServiceDto>> {
    const { page, pageSize, search, active } = query;
    const where: Prisma.ServiceWhereInput = {
      tenantId: groupId,
      ...(active !== undefined ? { active } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.service.count({ where }),
      this.prisma.service.findMany({
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

  async findOne(groupId: string, id: string): Promise<ServiceDto> {
    const service = await this.prisma.service.findFirst({
      where: { id, tenantId: groupId },
      include,
    });
    if (!service) throw new NotFoundException('Serviço não encontrado');
    return toDto(service);
  }

  async create(actor: AuthenticatedUser, input: CreateServiceInput): Promise<ServiceDto> {
    await this.assertParts(
      actor.groupId,
      input.defaultParts.map((p) => p.partId),
    );

    const created = await this.prisma.service.create({
      data: {
        tenantId: actor.groupId,
        name: input.name,
        category: input.category ?? null,
        description: input.description ?? null,
        salePrice: input.salePrice,
        cost: input.cost,
        estimatedMinutes: input.estimatedMinutes ?? null,
        active: input.active,
        showOnSite: input.showOnSite,
        defaultParts: {
          create: input.defaultParts.map((p) => ({
            partId: p.partId,
            quantity: p.quantity,
          })),
        },
      },
      include,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'services',
      entity: 'Service',
      entityId: created.id,
      after: { name: created.name },
    });

    return toDto(created);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateServiceInput,
  ): Promise<ServiceDto> {
    const current = await this.prisma.service.findFirst({
      where: { id, tenantId: actor.groupId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Serviço não encontrado');

    if (input.defaultParts) {
      await this.assertParts(
        actor.groupId,
        input.defaultParts.map((p) => p.partId),
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.service.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.category !== undefined ? { category: input.category ?? null } : {}),
          ...(input.description !== undefined ? { description: input.description ?? null } : {}),
          ...(input.salePrice !== undefined ? { salePrice: input.salePrice } : {}),
          ...(input.cost !== undefined ? { cost: input.cost } : {}),
          ...(input.estimatedMinutes !== undefined
            ? { estimatedMinutes: input.estimatedMinutes ?? null }
            : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
          ...(input.showOnSite !== undefined ? { showOnSite: input.showOnSite } : {}),
        },
      });

      if (input.defaultParts) {
        await tx.serviceDefaultPart.deleteMany({ where: { serviceId: id } });
        if (input.defaultParts.length > 0) {
          await tx.serviceDefaultPart.createMany({
            data: input.defaultParts.map((p) => ({
              serviceId: id,
              partId: p.partId,
              quantity: p.quantity,
            })),
          });
        }
      }
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'services',
      entity: 'Service',
      entityId: id,
    });

    return this.findOne(actor.groupId, id);
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const current = await this.prisma.service.findFirst({
      where: { id, tenantId: actor.groupId },
      select: { id: true },
    });
    if (!current) throw new NotFoundException('Serviço não encontrado');

    await this.prisma.service.delete({ where: { id } });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'DELETE',
      module: 'services',
      entity: 'Service',
      entityId: id,
    });
  }
}
