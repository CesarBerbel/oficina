import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type PrismaClient } from '@prisma/client';
import {
  canTransition,
  type CreatePurchaseInput,
  type ListPurchasesQuery,
  type Paginated,
  type PurchaseOrderDto,
  type PurchaseOrderSummaryDto,
  type ReceivePurchaseInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { applyStockMovement } from '../inventory/stock.helper';
import { parseNfeBuffer } from '../nfe-import/nfe-parser';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

type Tx = Prisma.TransactionClient | PrismaClient;
const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const include = {
  supplier: { select: { id: true, name: true } },
  serviceOrder: { select: { number: true } },
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
      serviceOrderId: r.serviceOrderId,
      serviceOrderNumber: r.serviceOrder?.number ?? null,
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

  /**
   * Gera pedidos com as peças abaixo do estoque mínimo, agrupados por fornecedor
   * (um pedido por fornecedor) e ignorando peças que já têm pedido em aberto.
   */
  async createFromShortages(
    actor: AuthenticatedUser,
  ): Promise<{ created: number }> {
    const parts = await this.prisma.part.findMany({
      where: {
        tenantId: actor.tenantId,
        active: true,
        currentStock: { lt: this.prisma.part.fields.minStock },
      },
      select: { id: true },
    });
    if (parts.length === 0) {
      throw new BadRequestException('Nenhuma peça abaixo do estoque mínimo');
    }

    const created = await this.prisma.$transaction((tx) =>
      this.replenishBelowMin(
        tx,
        actor.tenantId,
        parts.map((p) => p.id),
        actor.id,
      ),
    );
    if (created === 0) {
      throw new BadRequestException(
        'As peças em falta já possuem pedido de compra em aberto.',
      );
    }

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'purchases',
      entity: 'PurchaseOrder',
      after: { fromShortages: true, created },
    });

    return { created };
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

      // Compra vinculada a uma OS "aguardando peça": ao receber tudo e havendo
      // estoque suficiente, a OS avança automaticamente para "orçamento aprovado".
      if (order.serviceOrderId && allReceived) {
        const os = await tx.serviceOrder.findUnique({
          where: { id: order.serviceOrderId },
          select: { id: true, status: true },
        });
        if (
          os?.status === 'AGUARDANDO_PECA' &&
          canTransition(os.status, 'ORCAMENTO_APROVADO') &&
          (await this.isOrderStockCovered(tx, os.id))
        ) {
          await tx.serviceOrder.update({
            where: { id: os.id },
            data: {
              status: 'ORCAMENTO_APROVADO',
              history: {
                create: {
                  status: 'ORCAMENTO_APROVADO',
                  userId: actor.id,
                  note: `Peças recebidas (pedido #${order.number}) — orçamento aprovado`,
                },
              },
            },
          });
        }
      }
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

  /**
   * Recebe o pedido a partir do XML da NF-e: casa os itens da nota com os itens
   * do pedido por SKU (cProd) ou EAN e dá entrada da quantidade correspondente
   * (limitada ao saldo pendente de cada item). Reusa o fluxo de recebimento.
   */
  async receiveFromNfe(
    actor: AuthenticatedUser,
    id: string,
    buffer: Buffer,
    filename: string,
  ): Promise<PurchaseOrderDto> {
    const order = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId: actor.tenantId },
      include: { items: { include: { part: { select: { sku: true, ean: true } } } } },
    });
    if (!order) throw new NotFoundException('Pedido não encontrado');
    if (['RECEBIDO', 'CANCELADO'].includes(order.status)) {
      throw new BadRequestException('Pedido já finalizado');
    }

    let raw;
    try {
      raw = parseNfeBuffer(buffer, filename);
    } catch (err) {
      throw new BadRequestException(
        err instanceof Error ? err.message : 'Falha ao ler o XML da NF-e',
      );
    }

    // Quantidades e custo unitário da nota agregados por SKU e por EAN.
    const qtyBySku = new Map<string, number>();
    const qtyByEan = new Map<string, number>();
    const costBySku = new Map<string, number>();
    const costByEan = new Map<string, number>();
    for (const it of raw.items) {
      if (it.cProd) {
        qtyBySku.set(it.cProd, round3((qtyBySku.get(it.cProd) ?? 0) + it.quantity));
        if (it.unitCost > 0) costBySku.set(it.cProd, it.unitCost);
      }
      if (it.ean) {
        qtyByEan.set(it.ean, round3((qtyByEan.get(it.ean) ?? 0) + it.quantity));
        if (it.unitCost > 0) costByEan.set(it.ean, it.unitCost);
      }
    }

    const received: { itemId: string; quantity: number }[] = [];
    const costUpdates: { partId: string; costPrice: number }[] = [];
    for (const item of order.items) {
      const remaining = round3(dec(item.quantity) - dec(item.receivedQuantity));
      if (remaining <= 0) continue;
      const fromNfe =
        (item.part.sku ? qtyBySku.get(item.part.sku) : undefined) ??
        (item.part.ean ? qtyByEan.get(item.part.ean) : undefined) ??
        0;
      if (fromNfe > 0) {
        received.push({ itemId: item.id, quantity: Math.min(fromNfe, remaining) });
        // Atualiza o custo da peça com o valor unitário da nota.
        const nfeCost =
          (item.part.sku ? costBySku.get(item.part.sku) : undefined) ??
          (item.part.ean ? costByEan.get(item.part.ean) : undefined);
        if (nfeCost != null && nfeCost > 0) {
          costUpdates.push({ partId: item.partId, costPrice: round2(nfeCost) });
        }
      }
    }

    if (received.length === 0) {
      throw new BadRequestException(
        'Nenhum item da NF-e corresponde às peças do pedido (confira SKU/EAN das peças).',
      );
    }

    const result = await this.receive(actor, id, { received });

    // Atualiza o custo das peças com o valor da nota só após o recebimento.
    if (costUpdates.length > 0) {
      await this.prisma.$transaction(
        costUpdates.map((u) =>
          this.prisma.part.update({
            where: { id: u.partId },
            data: { costPrice: u.costPrice },
          }),
        ),
      );
    }

    return result;
  }

  // ─── Integração OS ↔ estoque (reserva + backorder) ───
  /**
   * Demanda de peças da OS (itens do catálogo), agregada por peça, com estoque,
   * reserva, custo e fornecedor atuais. Itens livres (sem `sourcePartId`) não
   * controlam estoque.
   */
  private async orderPartNeeds(
    tx: Tx,
    orderId: string,
  ): Promise<
    {
      part: {
        id: string;
        currentStock: Prisma.Decimal;
        reservedStock: Prisma.Decimal;
        costPrice: Prisma.Decimal;
        supplierId: string | null;
      };
      needed: number;
    }[]
  > {
    const items = await tx.serviceOrderItem.findMany({
      where: { serviceOrderId: orderId, kind: 'PART', sourcePartId: { not: null } },
      select: { sourcePartId: true, quantity: true },
    });
    const byPart = new Map<string, number>();
    for (const it of items) {
      const id = it.sourcePartId as string;
      byPart.set(id, round3((byPart.get(id) ?? 0) + dec(it.quantity)));
    }
    if (byPart.size === 0) return [];
    const parts = await tx.part.findMany({
      where: { id: { in: [...byPart.keys()] } },
      select: {
        id: true,
        currentStock: true,
        reservedStock: true,
        costPrice: true,
        supplierId: true,
      },
    });
    return parts.map((part) => ({ part, needed: byPart.get(part.id) ?? 0 }));
  }

  /** Cancela pedidos de compra em aberto (não recebidos) gerados pela OS. */
  private async cancelOpenOrderPurchases(tx: Tx, orderId: string): Promise<void> {
    await tx.purchaseOrder.updateMany({
      where: { serviceOrderId: orderId, status: { in: ['ABERTO', 'ENVIADO'] } },
      data: { status: 'CANCELADO' },
    });
  }

  /** Cria pedidos de compra agrupados por fornecedor (um pedido por fornecedor). */
  private async createGroupedPurchases(
    tx: Tx,
    tenantId: string,
    lines: { partId: string; supplierId: string | null; qty: number; costPrice: number }[],
    opts: { serviceOrderId?: string | null; notes: string },
  ): Promise<number> {
    const valid = lines.filter((l) => l.qty > 0);
    if (valid.length === 0) return 0;
    const groups = new Map<string, typeof valid>();
    for (const l of valid) {
      const key = l.supplierId ?? '__none__';
      const arr = groups.get(key) ?? [];
      arr.push(l);
      groups.set(key, arr);
    }
    let created = 0;
    for (const [key, group] of groups) {
      const number = await this.nextNumber(tx, tenantId);
      const total = round2(group.reduce((acc, l) => acc + l.qty * l.costPrice, 0));
      await tx.purchaseOrder.create({
        data: {
          tenantId,
          number,
          supplierId: key === '__none__' ? null : key,
          serviceOrderId: opts.serviceOrderId ?? null,
          status: 'ABERTO',
          total,
          notes: opts.notes,
          items: {
            create: group.map((l) => ({
              partId: l.partId,
              quantity: l.qty,
              unitCost: round2(l.costPrice),
              total: round2(l.qty * l.costPrice),
            })),
          },
        },
      });
      created++;
    }
    return created;
  }

  /**
   * Aprovação da OS: reserva o estoque das peças (hard allocation) e indica se
   * faltou estoque para alguma peça aprovada. NÃO gera pedido de compra — isso é
   * feito manualmente via `generatePurchaseForOrder`.
   */
  async commitApprovalReservation(
    tx: Tx,
    _tenantId: string,
    orderId: string,
  ): Promise<{ shortfall: boolean }> {
    const order = await tx.serviceOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { partsReserved: true },
    });
    const needs = await this.orderPartNeeds(tx, orderId);
    if (needs.length === 0) return { shortfall: false };

    let anyShortfall = false;
    for (const n of needs) {
      const available = dec(n.part.currentStock) - dec(n.part.reservedStock);
      if (round3(Math.max(0, n.needed - available)) > 0) anyShortfall = true;
      // Reserva a demanda completa (só uma vez por OS).
      if (!order.partsReserved) {
        await tx.part.update({
          where: { id: n.part.id },
          data: { reservedStock: { increment: n.needed } },
        });
      }
    }

    if (!order.partsReserved) {
      await tx.serviceOrder.update({
        where: { id: orderId },
        data: { partsReserved: true },
      });
    }

    return { shortfall: anyShortfall };
  }

  /**
   * Gera o pedido de compra (sob demanda) apenas com as peças aprovadas da OS
   * que estão em falta — quantidade = o que falta para cobrir a reserva da OS,
   * agrupado por fornecedor. Idempotente: cancela pedidos em aberto da OS antes.
   */
  async generatePurchaseForOrder(
    actor: AuthenticatedUser,
    orderId: string,
  ): Promise<{ created: number }> {
    const order = await this.prisma.serviceOrder.findFirst({
      where: { id: orderId, tenantId: actor.tenantId },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('OS não encontrada');
    if (!['ORCAMENTO_APROVADO', 'AGUARDANDO_PECA'].includes(order.status)) {
      throw new BadRequestException(
        'Gere o pedido de compra após a aprovação do orçamento.',
      );
    }

    const needs = await this.orderPartNeeds(this.prisma, orderId);
    const lines = needs
      .map((n) => {
        const uncovered = round3(
          Math.max(0, dec(n.part.reservedStock) - dec(n.part.currentStock)),
        );
        return {
          partId: n.part.id,
          supplierId: n.part.supplierId,
          qty: round3(Math.min(n.needed, uncovered)),
          costPrice: dec(n.part.costPrice),
        };
      })
      .filter((l) => l.qty > 0);

    if (lines.length === 0) {
      throw new BadRequestException(
        'Todas as peças aprovadas já estão em estoque — não é necessário comprar.',
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      await this.cancelOpenOrderPurchases(tx, orderId);
      return this.createGroupedPurchases(tx, actor.tenantId, lines, {
        serviceOrderId: orderId,
        notes: 'Peças aprovadas em falta na OS',
      });
    });

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'purchases',
      entity: 'PurchaseOrder',
      after: { fromOrder: orderId, created },
    });

    return { created };
  }

  /** Libera a reserva de estoque das peças da OS (reabertura/cancelamento). */
  async releaseOrderReservations(tx: Tx, orderId: string): Promise<void> {
    const order = await tx.serviceOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { partsReserved: true },
    });
    if (!order.partsReserved) return;
    const needs = await this.orderPartNeeds(tx, orderId);
    for (const n of needs) {
      if (n.needed <= 0) continue;
      const newReserved = round3(
        Math.max(0, dec(n.part.reservedStock) - n.needed),
      );
      await tx.part.update({
        where: { id: n.part.id },
        data: { reservedStock: newReserved },
      });
    }
    await tx.serviceOrder.update({
      where: { id: orderId },
      data: { partsReserved: false },
    });
  }

  /** Reabertura/cancelamento da OS: cancela compras em aberto e libera reservas. */
  async unwindOrderBackorder(tx: Tx, orderId: string): Promise<void> {
    await this.cancelOpenOrderPurchases(tx, orderId);
    await this.releaseOrderReservations(tx, orderId);
  }

  /** O estoque já cobre todas as reservas das peças da OS (disponível ≥ 0)? */
  async isOrderStockCovered(tx: Tx, orderId: string): Promise<boolean> {
    const needs = await this.orderPartNeeds(tx, orderId);
    return needs.every(
      (n) => dec(n.part.currentStock) - dec(n.part.reservedStock) >= 0,
    );
  }

  /**
   * Baixa do estoque (CONSUMO_OS) das peças da OS — chamada na execução. Também
   * libera a reserva e dispara a reposição automática de itens abaixo do mínimo.
   */
  async consumeOrderParts(
    tx: Tx,
    tenantId: string,
    orderId: string,
    userId: string | null,
  ): Promise<void> {
    const needs = await this.orderPartNeeds(tx, orderId);
    for (const n of needs) {
      if (n.needed <= 0) continue;
      await applyStockMovement(tx, {
        tenantId,
        partId: n.part.id,
        type: 'CONSUMO_OS',
        quantity: n.needed,
        unitCost: dec(n.part.costPrice),
        note: 'Consumo em OS (execução)',
        serviceOrderId: orderId,
        userId,
      });
    }
    // A baixa libera a reserva (a peça saiu do estoque para a OS).
    await this.releaseOrderReservations(tx, orderId);
    await this.replenishBelowMin(
      tx,
      tenantId,
      needs.map((n) => n.part.id),
      userId,
    );
  }

  /**
   * Reposição automática (ponto de pedido): para as peças abaixo do estoque
   * mínimo e sem pedido em aberto, gera pedido(s) de compra agrupados por
   * fornecedor para repor até o mínimo.
   */
  async replenishBelowMin(
    tx: Tx,
    tenantId: string,
    partIds: string[],
    _userId: string | null,
  ): Promise<number> {
    if (partIds.length === 0) return 0;
    const parts = await tx.part.findMany({
      where: { id: { in: partIds }, tenantId, active: true },
      select: {
        id: true,
        currentStock: true,
        minStock: true,
        costPrice: true,
        supplierId: true,
      },
    });
    const lines: {
      partId: string;
      supplierId: string | null;
      qty: number;
      costPrice: number;
    }[] = [];
    for (const p of parts) {
      const deficit = round3(dec(p.minStock) - dec(p.currentStock));
      if (deficit <= 0) continue;
      // Já há pedido em aberto cobrindo a peça? Então não duplica.
      const pending = await tx.purchaseOrderItem.findFirst({
        where: {
          partId: p.id,
          purchaseOrder: {
            tenantId,
            status: { in: ['ABERTO', 'ENVIADO', 'PARCIALMENTE_RECEBIDO'] },
          },
        },
        select: { id: true },
      });
      if (pending) continue;
      lines.push({
        partId: p.id,
        supplierId: p.supplierId,
        qty: deficit,
        costPrice: dec(p.costPrice),
      });
    }
    return this.createGroupedPurchases(tx, tenantId, lines, {
      notes: 'Reposição automática (estoque mínimo)',
    });
  }
}
