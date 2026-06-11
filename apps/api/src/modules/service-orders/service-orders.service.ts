import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Prisma, type PrismaClient, type MessageEvent } from '@prisma/client';
import {
  isTerminalStatus,
  type AddItemInput,
  type ChangeStatusInput,
  type CreateServiceOrderInput,
  type ListServiceOrdersQuery,
  type Paginated,
  type ServiceOrderDetailDto,
  type ServiceOrderItemKind,
  type ServiceOrderStatus,
  type ServiceOrderSummaryDto,
  type UpdateItemInput,
  type UpdateServiceOrderInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingService } from '../messaging/messaging.service';
import { applyStockMovement } from '../inventory/stock.helper';
import { quoteInclude, toQuoteDto } from '../quotes/quote.mapper';
import { ServiceOrderStateMachine } from './domain/service-order.state-machine';
import { ServiceOrderDomainError } from './domain/service-order.errors';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type Tx = Prisma.TransactionClient | PrismaClient;

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

const round2 = (n: number): number => Math.round(n * 100) / 100;

const detailInclude = {
  customer: { select: { id: true, name: true, phone: true } },
  vehicle: {
    select: {
      id: true,
      plate: true,
      manufacturer: true,
      model: true,
      modelYear: true,
    },
  },
  technician: { select: { id: true, name: true } },
  items: { orderBy: { createdAt: 'asc' } },
  history: {
    orderBy: { createdAt: 'asc' },
    include: { user: { select: { name: true } } },
  },
  quote: { include: quoteInclude },
} satisfies Prisma.ServiceOrderInclude;

type DetailRow = Prisma.ServiceOrderGetPayload<{ include: typeof detailInclude }>;

@Injectable()
export class ServiceOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly messaging: MessagingService,
  ) {}

  // ─── Mapping ───
  private isOverdue(row: {
    dueDate: Date | null;
    status: ServiceOrderStatus;
  }): boolean {
    if (!row.dueDate) return false;
    if (['ENTREGUE', 'CANCELADA', 'PRONTO_RETIRAR'].includes(row.status))
      return false;
    return row.dueDate.getTime() < Date.now();
  }

  private toSummary(row: DetailRow): ServiceOrderSummaryDto {
    const year = row.vehicle.modelYear ? ` ${row.vehicle.modelYear}` : '';
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      customerId: row.customerId,
      customerName: row.customer.name,
      vehicleId: row.vehicleId,
      vehiclePlate: row.vehicle.plate,
      vehicleLabel: `${row.vehicle.manufacturer} ${row.vehicle.model}${year}`,
      technicianId: row.technicianId,
      technicianName: row.technician?.name ?? null,
      total: dec(row.total),
      openedAt: row.openedAt.toISOString(),
      dueDate: row.dueDate ? row.dueDate.toISOString() : null,
      isOverdue: this.isOverdue(row),
    };
  }

  private toDetail(row: DetailRow): ServiceOrderDetailDto {
    return {
      ...this.toSummary(row),
      km: row.km,
      reportedProblem: row.reportedProblem,
      diagnosis: row.diagnosis,
      notes: row.notes,
      customerPhone: row.customer.phone,
      vehicleManufacturer: row.vehicle.manufacturer,
      vehicleModel: row.vehicle.model,
      vehicleModelYear: row.vehicle.modelYear,
      totalServices: dec(row.totalServices),
      totalParts: dec(row.totalParts),
      discount: dec(row.discount),
      editable: !isTerminalStatus(row.status),
      items: (() => {
        const byId = new Map(row.items.map((it) => [it.id, it.description]));
        return row.items.map((it) => ({
          id: it.id,
          kind: it.kind,
          description: it.description,
          quantity: dec(it.quantity),
          unitPrice: dec(it.unitPrice),
          total: dec(it.total),
          comboLabel: it.comboLabel,
          parentItemId: it.parentItemId,
          linkedServiceName: it.parentItemId
            ? (byId.get(it.parentItemId) ?? null)
            : null,
        }));
      })(),
      history: row.history.map((h) => ({
        id: h.id,
        status: h.status,
        note: h.note,
        userName: h.user?.name ?? null,
        createdAt: h.createdAt.toISOString(),
      })),
      publicToken: row.publicToken,
      quote: row.quote ? toQuoteDto(row.quote, row.publicToken) : null,
    };
  }

  // ─── Queries ───
  async list(
    tenantId: string,
    query: ListServiceOrdersQuery,
  ): Promise<Paginated<ServiceOrderSummaryDto>> {
    const { page, pageSize, search, status, technicianId, customerId } = query;
    const where: Prisma.ServiceOrderWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(technicianId ? { technicianId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(search
        ? {
            OR: [
              ...(/^\d+$/.test(search) ? [{ number: Number(search) }] : []),
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { vehicle: { plate: { contains: search.toUpperCase() } } },
            ],
          }
        : {}),
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.serviceOrder.count({ where }),
      this.prisma.serviceOrder.findMany({
        where,
        include: detailInclude,
        orderBy: { number: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: rows.map((r) => this.toSummary(r)),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  /** Agrupa OS ativas por status para o Kanban técnico. */
  async board(tenantId: string): Promise<Record<string, ServiceOrderSummaryDto[]>> {
    const rows = await this.prisma.serviceOrder.findMany({
      where: { tenantId, status: { notIn: ['ENTREGUE', 'CANCELADA'] } },
      include: detailInclude,
      orderBy: { openedAt: 'asc' },
    });
    const grouped: Record<string, ServiceOrderSummaryDto[]> = {};
    for (const row of rows) {
      (grouped[row.status] ??= []).push(this.toSummary(row));
    }
    return grouped;
  }

  /** Técnicos atribuíveis (perfil TECNICO ativos). Para o seletor da OS. */
  async technicians(tenantId: string): Promise<{ id: string; name: string }[]> {
    return this.prisma.user.findMany({
      where: { tenantId, role: 'TECNICO', active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(tenantId: string, id: string): Promise<ServiceOrderDetailDto> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      include: detailInclude,
    });
    if (!row) throw new NotFoundException('OS não encontrada');
    return this.toDetail(row);
  }

  // ─── Commands ───
  private async nextNumber(tx: Tx, tenantId: string): Promise<number> {
    const last = await tx.serviceOrder.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateServiceOrderInput,
  ): Promise<ServiceOrderDetailDto> {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: input.vehicleId, tenantId: actor.tenantId },
      select: { id: true, customerId: true },
    });
    if (!vehicle) throw new BadRequestException('Veículo inválido');
    if (vehicle.customerId !== input.customerId) {
      throw new BadRequestException('O veículo não pertence ao cliente informado');
    }
    if (input.technicianId) {
      const tech = await this.prisma.user.findFirst({
        where: { id: input.technicianId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!tech) throw new BadRequestException('Técnico inválido');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextNumber(tx, actor.tenantId);
      return tx.serviceOrder.create({
        data: {
          tenantId: actor.tenantId,
          number,
          publicToken: randomBytes(24).toString('hex'),
          customerId: input.customerId,
          vehicleId: input.vehicleId,
          km: input.km ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          technicianId: input.technicianId ?? null,
          reportedProblem: input.reportedProblem,
          status: 'ENTRADA',
          history: {
            create: { status: 'ENTRADA', userId: actor.id, note: 'OS aberta' },
          },
        },
        include: detailInclude,
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: created.id,
      after: { number: created.number, status: created.status },
    });

    await this.messaging.dispatchOrderEvent(actor.tenantId, 'OS_OPENED', created.id);

    return this.toDetail(created);
  }

  private async loadEditable(tenantId: string, id: string) {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId },
      select: { id: true, status: true, discount: true },
    });
    if (!row) throw new NotFoundException('OS não encontrada');
    ServiceOrderStateMachine.assertEditable(row.status);
    return row;
  }

  async update(
    actor: AuthenticatedUser,
    id: string,
    input: UpdateServiceOrderInput,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, id);

    if (input.technicianId) {
      const tech = await this.prisma.user.findFirst({
        where: { id: input.technicianId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!tech) throw new BadRequestException('Técnico inválido');
    }

    await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
        ...(input.technicianId !== undefined
          ? { technicianId: input.technicianId || null }
          : {}),
        ...(input.discount !== undefined ? { discount: round2(input.discount) } : {}),
      },
    });

    if (input.discount !== undefined) {
      await this.recomputeTotals(this.prisma, id);
    }

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: id,
    });

    return this.findOne(actor.tenantId, id);
  }

  async changeStatus(
    actor: AuthenticatedUser,
    id: string,
    input: ChangeStatusInput,
  ): Promise<ServiceOrderDetailDto> {
    const row = await this.prisma.serviceOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true, number: true, status: true },
    });
    if (!row) throw new NotFoundException('OS não encontrada');

    ServiceOrderStateMachine.assertTransition(row.status, input.status);

    await this.prisma.serviceOrder.update({
      where: { id },
      data: {
        status: input.status,
        ...(isTerminalStatus(input.status) ? { closedAt: new Date() } : {}),
        history: {
          create: {
            status: input.status,
            userId: actor.id,
            note: input.note ?? null,
          },
        },
      },
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'STATUS_CHANGE',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: id,
      before: { status: row.status },
      after: { status: input.status },
    });

    if (input.status === 'PRONTA' || input.status === 'PRONTO_RETIRAR') {
      await this.notifications.notifyRoles(actor.tenantId, ['ADMIN', 'ATENDENTE'], {
        type: 'OS_READY',
        title: `OS #${row.number} pronta`,
        body: 'Avisar o cliente para retirada do veículo.',
        link: `/os/${id}`,
        entity: 'ServiceOrder',
        entityId: id,
      });
    }

    // Mensagens automáticas por evento da OS.
    const statusEvent: Partial<Record<ServiceOrderStatus, MessageEvent>> = {
      DIAGNOSTICO_PRONTO: 'DIAGNOSIS_READY',
      EM_EXECUCAO: 'OS_IN_EXECUTION',
      PRONTA: 'OS_READY',
      ENTREGUE: 'VEHICLE_DELIVERED',
    };
    const evt = statusEvent[input.status];
    if (evt) {
      await this.messaging.dispatchOrderEvent(actor.tenantId, evt, id);
    }

    return this.findOne(actor.tenantId, id);
  }

  // ─── Itens ───
  private async recomputeTotals(tx: Tx, orderId: string): Promise<void> {
    const items = await tx.serviceOrderItem.findMany({
      where: { serviceOrderId: orderId },
      select: { kind: true, total: true },
    });
    let services = 0;
    let parts = 0;
    for (const it of items) {
      if (it.kind === 'SERVICE') services += dec(it.total);
      else parts += dec(it.total);
    }
    const order = await tx.serviceOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { discount: true },
    });
    const total = round2(services + parts - dec(order.discount));
    await tx.serviceOrder.update({
      where: { id: orderId },
      data: {
        totalServices: round2(services),
        totalParts: round2(parts),
        total: total < 0 ? 0 : total,
      },
    });
  }

  async addItem(
    actor: AuthenticatedUser,
    orderId: string,
    input: AddItemInput,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const lineTotal = round2(input.quantity * input.unitPrice);

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrderItem.create({
        data: {
          serviceOrderId: orderId,
          kind: input.kind as ServiceOrderItemKind,
          description: input.description,
          quantity: input.quantity,
          unitPrice: round2(input.unitPrice),
          total: lineTotal,
          sourceServiceId: input.sourceServiceId ?? null,
          sourcePartId: input.sourcePartId ?? null,
        },
      });
      await this.recomputeTotals(tx, orderId);
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'ITEM_ADD',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: orderId,
      after: { kind: input.kind, description: input.description },
    });

    return this.findOne(actor.tenantId, orderId);
  }

  async updateItem(
    actor: AuthenticatedUser,
    orderId: string,
    itemId: string,
    input: UpdateItemInput,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const item = await this.prisma.serviceOrderItem.findFirst({
      where: { id: itemId, serviceOrderId: orderId },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    // Vínculo peça↔serviço: valida quando informado (string = vincular, null = desvincular).
    if (input.parentItemId !== undefined && input.parentItemId !== null) {
      if (item.kind !== 'PART') {
        throw new BadRequestException(
          'Apenas peças podem ser vinculadas a um serviço',
        );
      }
      const parent = await this.prisma.serviceOrderItem.findFirst({
        where: {
          id: input.parentItemId,
          serviceOrderId: orderId,
          kind: 'SERVICE',
        },
        select: { id: true },
      });
      if (!parent) {
        throw new BadRequestException('Serviço inválido para o vínculo');
      }
    }

    const quantity = input.quantity ?? dec(item.quantity);
    const unitPrice = input.unitPrice ?? dec(item.unitPrice);

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrderItem.update({
        where: { id: itemId },
        data: {
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.parentItemId !== undefined
            ? { parentItemId: input.parentItemId }
            : {}),
          quantity,
          unitPrice: round2(unitPrice),
          total: round2(quantity * unitPrice),
        },
      });
      await this.recomputeTotals(tx, orderId);
    });

    return this.findOne(actor.tenantId, orderId);
  }

  async removeItem(
    actor: AuthenticatedUser,
    orderId: string,
    itemId: string,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const item = await this.prisma.serviceOrderItem.findFirst({
      where: { id: itemId, serviceOrderId: orderId },
      select: { id: true, sourcePartId: true, quantity: true, description: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado');

    await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrderItem.delete({ where: { id: itemId } });
      // Item vindo do catálogo (peça): estorna o estoque consumido.
      if (item.sourcePartId) {
        await applyStockMovement(tx, {
          tenantId: actor.tenantId,
          partId: item.sourcePartId,
          type: 'ESTORNO',
          quantity: dec(item.quantity),
          note: `Estorno de item removido da OS`,
          serviceOrderId: orderId,
          userId: actor.id,
        });
      }
      await this.recomputeTotals(tx, orderId);
    });

    return this.findOne(actor.tenantId, orderId);
  }

  // ─── Catálogo → OS ───
  /** Cria um item de peça (snapshot) e baixa o estoque dentro da transação. */
  private async addPartItemTx(
    tx: Prisma.TransactionClient,
    actor: AuthenticatedUser,
    orderId: string,
    part: { id: string; name: string; salePrice: Prisma.Decimal | number; costPrice: Prisma.Decimal | number },
    quantity: number,
    parentItemId?: string,
  ): Promise<void> {
    const unitPrice = round2(dec(part.salePrice));
    await tx.serviceOrderItem.create({
      data: {
        serviceOrderId: orderId,
        kind: 'PART',
        description: part.name,
        quantity,
        unitPrice,
        total: round2(unitPrice * quantity),
        sourcePartId: part.id,
        parentItemId: parentItemId ?? null,
      },
    });
    await applyStockMovement(tx, {
      tenantId: actor.tenantId,
      partId: part.id,
      type: 'CONSUMO_OS',
      quantity,
      unitCost: dec(part.costPrice),
      note: 'Consumo em OS',
      serviceOrderId: orderId,
      userId: actor.id,
    });
  }

  /** Adiciona um serviço do catálogo + suas peças padrão (com baixa de estoque). */
  async addServiceFromCatalog(
    actor: AuthenticatedUser,
    orderId: string,
    serviceId: string,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId: actor.tenantId },
      include: {
        defaultParts: {
          include: {
            part: {
              select: { id: true, name: true, salePrice: true, costPrice: true },
            },
          },
        },
      },
    });
    if (!service) throw new BadRequestException('Serviço inválido');

    await this.prisma.$transaction(async (tx) => {
      const price = round2(dec(service.salePrice));
      const serviceItem = await tx.serviceOrderItem.create({
        data: {
          serviceOrderId: orderId,
          kind: 'SERVICE',
          description: service.name,
          quantity: 1,
          unitPrice: price,
          total: price,
          sourceServiceId: service.id,
        },
      });
      for (const dp of service.defaultParts) {
        await this.addPartItemTx(
          tx,
          actor,
          orderId,
          dp.part,
          dec(dp.quantity),
          serviceItem.id,
        );
      }
      await this.recomputeTotals(tx, orderId);
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'ITEM_ADD',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: orderId,
      after: { fromCatalog: 'service', name: service.name },
    });

    return this.findOne(actor.tenantId, orderId);
  }

  /** Adiciona uma peça do catálogo (com baixa de estoque). */
  async addPartFromCatalog(
    actor: AuthenticatedUser,
    orderId: string,
    partId: string,
    quantity: number,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const part = await this.prisma.part.findFirst({
      where: { id: partId, tenantId: actor.tenantId },
      select: { id: true, name: true, salePrice: true, costPrice: true },
    });
    if (!part) throw new BadRequestException('Peça inválida');

    await this.prisma.$transaction(async (tx) => {
      await this.addPartItemTx(tx, actor, orderId, part, quantity);
      await this.recomputeTotals(tx, orderId);
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'ITEM_ADD',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: orderId,
      after: { fromCatalog: 'part', name: part.name },
    });

    return this.findOne(actor.tenantId, orderId);
  }

  /**
   * Adiciona um combo: expande nos serviços que o compõem (+ peças padrão deles).
   * O combo NÃO aparece como tal na OS — somente os serviços e peças.
   */
  async addComboToOrder(
    actor: AuthenticatedUser,
    orderId: string,
    comboId: string,
  ): Promise<ServiceOrderDetailDto> {
    await this.loadEditable(actor.tenantId, orderId);
    const combo = await this.prisma.combo.findFirst({
      where: { id: comboId, tenantId: actor.tenantId },
      include: {
        services: {
          orderBy: { position: 'asc' },
          include: {
            service: {
              include: {
                defaultParts: {
                  include: {
                    part: {
                      select: {
                        id: true,
                        name: true,
                        salePrice: true,
                        costPrice: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!combo) throw new BadRequestException('Combo inválido');

    await this.prisma.$transaction(async (tx) => {
      for (const cs of combo.services) {
        const svc = cs.service;
        const price = round2(dec(svc.salePrice));
        const serviceItem = await tx.serviceOrderItem.create({
          data: {
            serviceOrderId: orderId,
            kind: 'SERVICE',
            description: svc.name,
            quantity: 1,
            unitPrice: price,
            total: price,
            sourceServiceId: svc.id,
          },
        });
        for (const dp of svc.defaultParts) {
          await this.addPartItemTx(
            tx,
            actor,
            orderId,
            dp.part,
            dec(dp.quantity),
            serviceItem.id,
          );
        }
      }
      await this.recomputeTotals(tx, orderId);
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'ITEM_ADD',
      module: 'service-orders',
      entity: 'ServiceOrder',
      entityId: orderId,
      after: { fromCatalog: 'combo', name: combo.name },
    });

    return this.findOne(actor.tenantId, orderId);
  }
}

export { ServiceOrderDomainError };
