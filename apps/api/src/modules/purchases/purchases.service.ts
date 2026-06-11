import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import type {
  CreatePurchaseInput,
  ListPurchasesQuery,
  Paginated,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
  ReceivePurchaseInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { applyStockMovement } from '../inventory/stock.helper';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type Tx = Prisma.TransactionClient | PrismaClient;
const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);
const round2 = (n: number): number => Math.round(n * 100) / 100;

const include = {
  supplier: { select: { id: true, name: true } },
  items: { include: { part: { select: { name: true, unit: true } } } },
} satisfies Prisma.PurchaseOrderInclude;

type Row = Prisma.PurchaseOrderGetPayload<{ include: typeof include }>;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toSummary(r: Row): PurchaseOrderSummaryDto {
    return {
      id: r.id,
      number: r.number,
      status: r.status,
      supplierId: r.supplierId,
      supplierName: r.supplier?.name ?? null,
      itemsCount: r.items.length,
      total: dec(r.total),
      dueDate: r.dueDate ? r.dueDate.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private toDto(r: Row): PurchaseOrderDto {
    return {
      ...this.toSummary(r),
      notes: r.notes,
      items: r.items.map((it) => ({
        id: it.id,
        partId: it.partId,
        partName: it.part.name,
        unit: it.part.unit,
        quantity: dec(it.quantity),
        receivedQuantity: dec(it.receivedQuantity),
        unitCost: dec(it.unitCost),
        total: dec(it.total),
      })),
    };
  }

  private async nextNumber(tx: Tx, tenantId: string): Promise<number> {
    const last = await tx.purchaseOrder.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  async list(
    tenantId: string,
    query: ListPurchasesQuery,
  ): Promise<Paginated<PurchaseOrderSummaryDto>> {
    const { page, pageSize, search, status } = query;
    const where: Prisma.PurchaseOrderWhereInput = {
      tenantId,
      ...(status ? { status } : {}),
      ...(search && /^\d+$/.test(search) ? { number: Number(search) } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        include,
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

  async findOne(tenantId: string, id: string): Promise<PurchaseOrderDto> {
    const row = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include,
    });
    if (!row) throw new NotFoundException('Pedido não encontrado');
    return this.toDto(row);
  }

  private async assertParts(tenantId: string, partIds: string[]): Promise<void> {
    const count = await this.prisma.part.count({
      where: { tenantId, id: { in: partIds } },
    });
    if (count !== new Set(partIds).size) {
      throw new BadRequestException('Uma ou mais peças são inválidas');
    }
  }

  async create(
    actor: AuthenticatedUser,
    input: CreatePurchaseInput,
  ): Promise<PurchaseOrderDto> {
    await this.assertParts(
      actor.tenantId,
      input.items.map((i) => i.partId),
    );
    if (input.supplierId) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: input.supplierId, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!s) throw new BadRequestException('Fornecedor inválido');
    }

    const total = round2(
      input.items.reduce((acc, i) => acc + i.quantity * i.unitCost, 0),
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const number = await this.nextNumber(tx, actor.tenantId);
      return tx.purchaseOrder.create({
        data: {
          tenantId: actor.tenantId,
          number,
          supplierId: input.supplierId ?? null,
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          notes: input.notes ?? null,
          total,
          items: {
            create: input.items.map((i) => ({
              partId: i.partId,
              quantity: i.quantity,
              unitCost: round2(i.unitCost),
              total: round2(i.quantity * i.unitCost),
            })),
          },
        },
        include,
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'purchases',
      entity: 'PurchaseOrder',
      entityId: created.id,
      after: { number: created.number, total },
    });

    return this.toDto(created);
  }

  /** Cria um pedido com as peças abaixo do estoque mínimo. */
  async createFromShortages(actor: AuthenticatedUser): Promise<PurchaseOrderDto> {
    const parts = await this.prisma.part.findMany({
      where: {
        tenantId: actor.tenantId,
        active: true,
        currentStock: { lt: this.prisma.part.fields.minStock },
      },
      select: { id: true, currentStock: true, minStock: true, costPrice: true },
    });
    if (parts.length === 0) {
      throw new BadRequestException('Nenhuma peça abaixo do estoque mínimo');
    }
    return this.create(actor, {
      items: parts.map((p) => ({
        partId: p.id,
        quantity: Math.max(1, dec(p.minStock) - dec(p.currentStock)),
        unitCost: dec(p.costPrice),
      })),
    });
  }

  async setStatus(
    actor: AuthenticatedUser,
    id: string,
    status: 'ENVIADO' | 'CANCELADO',
  ): Promise<PurchaseOrderDto> {
    const current = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      select: { id: true, status: true },
    });
    if (!current) throw new NotFoundException('Pedido não encontrado');
    if (['RECEBIDO', 'CANCELADO'].includes(current.status)) {
      throw new BadRequestException('Pedido finalizado não pode mudar de status');
    }
    await this.prisma.purchaseOrder.update({ where: { id }, data: { status } });
    return this.findOne(actor.tenantId, id);
  }

  /** Recebimento: dá entrada no estoque (COMPRA) e atualiza quantidades. */
  async receive(
    actor: AuthenticatedUser,
    id: string,
    input: ReceivePurchaseInput,
  ): Promise<PurchaseOrderDto> {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (['RECEBIDO', 'CANCELADO'].includes(order.status)) {
      throw new BadRequestException('Pedido já finalizado');
    }

    const recvMap = new Map(input.received.map((r) => [r.itemId, r.quantity]));

    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) {
        const recv = recvMap.get(item.id) ?? 0;
        if (recv <= 0) continue;
        const newReceived = dec(item.receivedQuantity) + recv;
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: { receivedQuantity: newReceived },
        });
        await applyStockMovement(tx, {
          tenantId: actor.tenantId,
          partId: item.partId,
          type: 'COMPRA',
          quantity: recv,
          unitCost: dec(item.unitCost),
          note: `Recebimento do pedido #${order.number}`,
          userId: actor.id,
        });
      }

      // Recalcula status com base no recebido total.
      const items = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: id },
        select: { quantity: true, receivedQuantity: true },
      });
      const allReceived = items.every(
        (i) => dec(i.receivedQuantity) >= dec(i.quantity),
      );
      const anyReceived = items.some((i) => dec(i.receivedQuantity) > 0);
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: allReceived
            ? 'RECEBIDO'
            : anyReceived
              ? 'PARCIALMENTE_RECEBIDO'
              : order.status,
        },
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'PURCHASE_RECEIVE',
      module: 'purchases',
      entity: 'PurchaseOrder',
      entityId: id,
    });

    return this.findOne(actor.tenantId, id);
  }
}
