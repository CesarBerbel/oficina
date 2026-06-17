import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateVehicleInput,
  ListVehiclesQuery,
  Paginated,
  UpdateVehicleInput,
  VehicleDto,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type VehicleRow = Prisma.VehicleGetPayload<{
  include: { customer: { select: { name: true } } };
}>;

function toDto(v: VehicleRow): VehicleDto {
  return {
    id: v.id,
    customerId: v.customerId,
    customerName: v.customer.name,
    plate: v.plate,
    manufacturer: v.manufacturer,
    model: v.model,
    modelYear: v.modelYear,
    color: v.color,
    fuel: v.fuel,
    engine: v.engine,
    transmission: v.transmission,
    currentKm: v.currentKm,
    notes: v.notes,
    createdAt: v.createdAt.toISOString(),
  };
}

const withCustomer = {
  include: { customer: { select: { name: true } } },
} satisfies Prisma.VehicleDefaultArgs;

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // Veículos são compartilhados no grupo (matriz + filiais): escopo por groupId.
  async list(
    groupId: string,
    query: ListVehiclesQuery,
  ): Promise<Paginated<VehicleDto>> {
    const { page, pageSize, search, customerId, fuel, sortBy, sortOrder } =
      query;

    const where: Prisma.VehicleWhereInput = {
      tenantId: groupId,
      ...(customerId ? { customerId } : {}),
      ...(fuel ? { fuel } : {}),
      ...(search
        ? {
            OR: [
              { plate: { contains: search.toUpperCase() } },
              { manufacturer: { contains: search, mode: 'insensitive' } },
              { model: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderBy: Prisma.VehicleOrderByWithRelationInput = {
      [sortBy && ['plate', 'manufacturer', 'createdAt'].includes(sortBy)
        ? sortBy
        : 'createdAt']: sortBy ? sortOrder : 'desc',
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicle.count({ where }),
      this.prisma.vehicle.findMany({
        where,
        ...withCustomer,
        orderBy,
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

  async findOne(groupId: string, id: string): Promise<VehicleDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, tenantId: groupId },
      ...withCustomer,
    });
    if (!vehicle) throw new NotFoundException('Veículo não encontrado');
    return toDto(vehicle);
  }

  private async assertCustomer(groupId: string, customerId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId: groupId },
      select: { id: true },
    });
    if (!customer)
      throw new BadRequestException('Cliente inválido para este veículo');
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateVehicleInput,
  ): Promise<VehicleDto> {
    await this.assertCustomer(actor.groupId, input.customerId);

    const clash = await this.prisma.vehicle.findFirst({
      where: { tenantId: actor.groupId, plate: input.plate },
    });
    if (clash) throw new ConflictException('Placa já cadastrada');

    const created = await this.prisma.vehicle.create({
      data: { tenantId: actor.groupId, ...input },
      ...withCustomer,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'vehicles',
      entity: 'Vehicle',
      entityId: created.id,
      after: { plate: created.plate, model: created.model },
    });

    return toDto(created);
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateVehicleInput,
  ): Promise<VehicleDto> {
    const current = await this.prisma.vehicle.findFirst({
      where: { id, tenantId: actor.groupId },
    });
    if (!current) throw new NotFoundException('Veículo não encontrado');

    if (input.plate && input.plate !== current.plate) {
      const clash = await this.prisma.vehicle.findFirst({
        where: { tenantId: actor.groupId, plate: input.plate, NOT: { id } },
      });
      if (clash) throw new ConflictException('Placa já cadastrada');
    }

    if (input.customerId && input.customerId !== current.customerId) {
      await this.assertCustomer(actor.groupId, input.customerId);
    }

    const updated = await this.prisma.vehicle.update({
      where: { id },
      data: input,
      ...withCustomer,
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'vehicles',
      entity: 'Vehicle',
      entityId: id,
      before: {
        customerId: current.customerId,
        plate: current.plate,
        model: current.model,
      },
      after: {
        customerId: updated.customerId,
        plate: updated.plate,
        model: updated.model,
      },
    });

    return toDto(updated);
  }

  async remove(actor: AuthenticatedUser, id: string): Promise<void> {
    const current = await this.prisma.vehicle.findFirst({
      where: { id, tenantId: actor.groupId },
    });
    if (!current) throw new NotFoundException('Veículo não encontrado');

    // Veículo é do grupo: bloqueia exclusão se houver vínculo em QUALQUER filial.
    const [serviceOrdersCount, checkinsCount] = await this.prisma.$transaction([
      this.prisma.serviceOrder.count({ where: { vehicleId: id } }),
      this.prisma.vehicleCheckin.count({ where: { vehicleId: id } }),
    ]);

    if (serviceOrdersCount > 0 || checkinsCount > 0) {
      const links: string[] = [];
      if (serviceOrdersCount > 0) {
        links.push(
          `${serviceOrdersCount} ordem(ns) de serviço vinculada(s)`,
        );
      }
      if (checkinsCount > 0) {
        links.push(`${checkinsCount} check-in(s) vinculado(s)`);
      }

      throw new ConflictException({
        code: 'VEHICLE_IN_USE',
        message: `Não é possível excluir o veículo ${current.plate}, pois existem ${links.join(' e ')}. Mantenha o cadastro para preservar o histórico.`,
        details: { serviceOrdersCount, checkinsCount },
      });
    }

    await this.prisma.vehicle.delete({ where: { id } });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'DELETE',
      module: 'vehicles',
      entity: 'Vehicle',
      entityId: id,
      before: { plate: current.plate },
    });
  }
}
