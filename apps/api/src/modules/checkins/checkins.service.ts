import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  ChecklistItem,
  CreateCheckinInput,
  CheckinDto,
  DamagePoint,
  ListCheckinsQuery,
  Paginated,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type CheckinRow = Prisma.VehicleCheckinGetPayload<{
  include: {
    vehicle: { select: { plate: true; manufacturer: true; model: true } };
    customer: { select: { name: true } };
    serviceOrder: { select: { number: true } };
    createdBy: { select: { name: true } };
  };
}>;

const withRelations = {
  include: {
    vehicle: { select: { plate: true, manufacturer: true, model: true } },
    customer: { select: { name: true } },
    serviceOrder: { select: { number: true } },
    createdBy: { select: { name: true } },
  },
} satisfies Prisma.VehicleCheckinDefaultArgs;

function toDto(c: CheckinRow): CheckinDto {
  return {
    id: c.id,
    vehicleId: c.vehicleId,
    vehiclePlate: c.vehicle.plate,
    vehicleLabel: `${c.vehicle.manufacturer} ${c.vehicle.model}`,
    customerId: c.customerId,
    customerName: c.customer.name,
    serviceOrderId: c.serviceOrderId,
    serviceOrderNumber: c.serviceOrder.number,
    km: c.km,
    fuelLevel: c.fuelLevel,
    damages: (c.damages as unknown as DamagePoint[]) ?? [],
    checklist: (c.checklist as unknown as ChecklistItem[]) ?? [],
    photos: c.photos,
    signatureUrl: c.signatureUrl,
    signedBy: c.signedBy,
    notes: c.notes,
    createdById: c.createdById,
    createdByName: c.createdBy?.name ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

@Injectable()
export class CheckinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    tenantId: string,
    query: ListCheckinsQuery,
  ): Promise<Paginated<CheckinDto>> {
    const { page, pageSize, search, vehicleId, customerId, serviceOrderId } =
      query;

    const where: Prisma.VehicleCheckinWhereInput = {
      tenantId,
      ...(vehicleId ? { vehicleId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(serviceOrderId ? { serviceOrderId } : {}),
      ...(search
        ? {
            OR: [
              { vehicle: { plate: { contains: search.toUpperCase() } } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.vehicleCheckin.count({ where }),
      this.prisma.vehicleCheckin.findMany({
        where,
        ...withRelations,
        orderBy: { createdAt: 'desc' },
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

  async findOne(tenantId: string, id: string): Promise<CheckinDto> {
    const checkin = await this.prisma.vehicleCheckin.findFirst({
      where: { id, tenantId },
      ...withRelations,
    });
    if (!checkin) throw new NotFoundException('Check-in não encontrado');
    return toDto(checkin);
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateCheckinInput,
  ): Promise<CheckinDto> {
    // Veículo é compartilhado no grupo (groupId); o check-in é por filial.
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, tenantId: actor.groupId },
      select: { id: true, customerId: true, currentKm: true },
    });
    if (!vehicle) throw new BadRequestException('Veículo inválido');

    const os = await this.prisma.serviceOrder.findFirst({
      where: { id: input.serviceOrderId, tenantId: actor.tenantId },
      select: { id: true, vehicleId: true },
    });
    if (!os) throw new BadRequestException('OS inválida');
    if (os.vehicleId !== vehicle.id) {
      throw new BadRequestException('A OS informada é de outro veículo');
    }

    // Apenas um check-in por OS.
    const existing = await this.prisma.vehicleCheckin.findFirst({
      where: { serviceOrderId: input.serviceOrderId, tenantId: actor.tenantId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Esta OS já possui um check-in.');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const checkin = await tx.vehicleCheckin.create({
        data: {
          tenantId: actor.tenantId,
          vehicleId: vehicle.id,
          customerId: vehicle.customerId,
          serviceOrderId: input.serviceOrderId,
          km: input.km ?? null,
          fuelLevel: input.fuelLevel ?? null,
          damages: input.damages as unknown as Prisma.InputJsonValue,
          checklist: input.checklist as unknown as Prisma.InputJsonValue,
          photos: input.photos,
          signatureUrl: input.signatureUrl ?? null,
          signedBy: input.signedBy ?? null,
          notes: input.notes ?? null,
          createdById: actor.id,
        },
        ...withRelations,
      });

      // Mantém o KM do veículo atualizado quando o check-in traz leitura maior.
      if (
        input.km != null &&
        (vehicle.currentKm == null || input.km > vehicle.currentKm)
      ) {
        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: { currentKm: input.km },
        });
      }

      // Preenche o KM da OS se ainda estiver vazio.
      if (input.km != null) {
        await tx.serviceOrder.updateMany({
          where: { id: input.serviceOrderId, km: null },
          data: { km: input.km },
        });
      }

      return checkin;
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'checkins',
      entity: 'VehicleCheckin',
      entityId: created.id,
      after: {
        vehicleId: created.vehicleId,
        km: created.km,
        serviceOrderId: created.serviceOrderId,
      },
    });

    return toDto(created);
  }
}
