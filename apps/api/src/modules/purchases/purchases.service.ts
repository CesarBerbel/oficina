import {
  BadRequestException,
  ConflictException,
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
import { purchaseInclude, toDto, toSummaryDto } from './purchases.mapper';

type Tx = Prisma.TransactionClient | PrismaClient;
const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));
const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const PURCHASE_NUMBER_RETRY_ATTEMPTS = 5;

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Gera o próximo número do pedido dentro da transação atual.
   *
   * A constraint @@unique([tenantId, number]) é a proteção final contra
   * concorrência. As operações que geram pedidos fazem retry em P2002,
   * reexecutando a transação inteira e evitando SQL específico de advisory lock
   * nos testes e em PostgreSQL gerenciado.
   */
  private async nextNumber(tx: Tx, tenantId: string): Promise<number> {
    const last = await tx.purchaseOrder.findFirst({
      where: { tenantId },
      orderBy: { number: 'desc' },
      select: { number: true },
    });
    return (last?.number ?? 0) + 1;
  }

  private isUniqueConstraintError(err: unknown): boolean {
    return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
  }

  /**
   * Reexecuta operações que calculam `nextNumber` e criam pedidos de compra.
   * Em PostgreSQL, uma violação de unique constraint aborta a transação atual;
   * por isso o retry precisa envolver a transação completa, não apenas o create.
   */
  private async withPurchaseNumberRetry<T>(
    operation: () => Promise<T>,
    failureMessage = 'Não foi possível gerar o número do pedido',
  ): Promise<T> {
    for (let attempt = 1; attempt <= PURCHASE_NUMBER_RETRY_ATTEMPTS; attempt++) {
      try {
        return await operation();
      } catch (err) {
        if (this.isUniqueConstraintError(err)) {
          if (attempt < PURCHASE_NUMBER_RETRY_ATTEMPTS) continue;
          throw new BadRequestException(failureMessage);
        }
        throw err;
      }
    }

    throw new BadRequestException(failureMessage);
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
        include: purchaseInclude,
        orderBy: { number: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => toSummaryDto(r)),
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
      include: purchaseInclude,
    });
    if (!row) throw new NotFoundException('Pedido não encontrado');
    return toDto(row);
  }

  /** Resolve o grupo (matriz) a partir do tenant da oficina. */
  private async groupOf(tx: Tx, tenantId: string): Promise<string> {
    const t = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { parentId: true },
    });
    return t?.parentId ?? tenantId;
  }

  // Peças/fornecedores são do grupo (catálogo compartilhado).
  private async assertParts(groupId: string, partIds: string[]): Promise<void> {
    const count = await this.prisma.part.count({
      where: { tenantId: groupId, id: { in: partIds } },
    });
    if (count !== new Set(partIds).size) {
      throw new BadRequestException('Uma ou mais peças são inválidas');
    }
  }

  async create(actor: AuthenticatedUser, input: CreatePurchaseInput): Promise<PurchaseOrderDto> {
    await this.assertParts(
      actor.groupId,
      input.items.map((i) => i.partId),
    );
    if (input.supplierId) {
      const s = await this.prisma.supplier.findFirst({
        where: { id: input.supplierId, tenantId: actor.groupId },
        select: { id: true },
      });
      if (!s) throw new BadRequestException('Fornecedor inválido');
    }

    const total = round2(input.items.reduce((acc, i) => acc + i.quantity * i.unitCost, 0));

    const created = await this.withPurchaseNumberRetry(() =>
      this.prisma.$transaction(async (tx) => {
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
          include: purchaseInclude,
        });
      }),
    );

    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'CREATE',
      module: 'purchases',
      entity: 'PurchaseOrder',
      entityId: created.id,
      after: { number: created.number, total },
    });

    return toDto(created);
  }

  /**
   * Gera pedidos com as peças abaixo do estoque mínimo, agrupados por fornecedor
   * (um pedido por fornecedor) e ignorando peças que já têm pedido em aberto.
   */
  async createFromShortages(actor: AuthenticatedUser): Promise<{ created: number }> {
    // Peças abaixo do mínimo NA OFICINA do usuário (saldo por filial, mínimo do grupo).
    const parts = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT p."id"
      FROM "parts" p
      LEFT JOIN "part_stock" ps ON ps."partId" = p."id" AND ps."tenantId" = ${actor.tenantId}
      WHERE p."tenantId" = ${actor.groupId}
        AND p."active" = true
        AND COALESCE(ps."currentStock", 0) < p."minStock"
    `;
    if (parts.length === 0) {
      throw new BadRequestException('Nenhuma peça abaixo do estoque mínimo');
    }

    const created = await this.withPurchaseNumberRetry(() =>
      this.prisma.$transaction((tx) =>
        this.replenishBelowMin(
          tx,
          actor.tenantId,
          parts.map((p) => p.id),
          actor.id,
        ),
      ),
    );
    if (created === 0) {
      throw new BadRequestException('As peças em falta já possuem pedido de compra em aberto.');
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
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.purchaseOrder.findFirst({
        where: { id, tenantId: actor.tenantId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('Pedido não encontrado');
      if (['RECEBIDO', 'CANCELADO'].includes(order.status)) {
        throw new BadRequestException('Pedido já finalizado');
      }

      const itemsById = new Map(order.items.map((item) => [item.id, item]));
      const recvMap = new Map<string, number>();
      let positiveReceipts = 0;

      for (const received of input.received) {
        if (recvMap.has(received.itemId)) {
          throw new BadRequestException(
            'Informe cada item do pedido apenas uma vez no recebimento',
          );
        }

        const item = itemsById.get(received.itemId);
        if (!item) {
          throw new BadRequestException('Item inválido para este pedido de compra');
        }

        const quantity = round3(received.quantity);
        if (quantity <= 0) {
          recvMap.set(received.itemId, 0);
          continue;
        }

        const remaining = round3(dec(item.quantity) - dec(item.receivedQuantity));
        if (remaining <= 0) {
          throw new BadRequestException('Este item já foi totalmente recebido');
        }
        if (quantity > remaining) {
          throw new BadRequestException('Quantidade recebida excede o saldo pendente do item');
        }

        recvMap.set(received.itemId, quantity);
        positiveReceipts++;
      }

      if (positiveReceipts === 0) {
        throw new BadRequestException('Informe ao menos uma quantidade positiva para receber');
      }

      for (const item of order.items) {
        const recv = recvMap.get(item.id) ?? 0;
        if (recv <= 0) continue;
        const maxBeforeReceive = round3(dec(item.quantity) - recv);
        const updated = await tx.purchaseOrderItem.updateMany({
          where: {
            id: item.id,
            purchaseOrderId: id,
            receivedQuantity: { lte: maxBeforeReceive },
          },
          data: { receivedQuantity: { increment: recv } },
        });
        if (updated.count !== 1) {
          throw new ConflictException(
            'Recebimento concorrente detectado. Recarregue o pedido e tente novamente.',
          );
        }
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
      const allReceived = items.every((i) => dec(i.receivedQuantity) >= dec(i.quantity));
      const anyReceived = items.some((i) => dec(i.receivedQuantity) > 0);
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          status: allReceived ? 'RECEBIDO' : anyReceived ? 'PARCIALMENTE_RECEBIDO' : order.status,
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
          const moved = await tx.serviceOrder.updateMany({
            where: { id: os.id, status: 'AGUARDANDO_PECA' },
            data: { status: 'ORCAMENTO_APROVADO' },
          });
          if (moved.count === 1) {
            await tx.serviceOrderStatusHistory.create({
              data: {
                serviceOrderId: os.id,
                status: 'ORCAMENTO_APROVADO',
                userId: actor.id,
                note: `Peças recebidas (pedido #${order.number}) — orçamento aprovado`,
              },
            });
          }
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
   * do pedido por código da peça (cProd) ou EAN e dá entrada da quantidade correspondente
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

    // Quantidades e custo unitário da nota agregados por código da peça e por EAN.
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
        'Nenhum item da NF-e corresponde às peças do pedido (confira código da peça/EAN das peças).',
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
      partId: string;
      branchId: string;
      currentStock: number;
      reservedStock: number;
      costPrice: number;
      supplierId: string | null;
      needed: number;
    }[]
  > {
    const order = await tx.serviceOrder.findUnique({
      where: { id: orderId },
      select: { tenantId: true },
    });
    if (!order) return [];
    const branchId = order.tenantId;
    const groupId = await this.groupOf(tx, branchId);

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

    const partIds = [...byPart.keys()];
    // Catálogo (custo/fornecedor) é do grupo; saldo/reserva são da filial da OS.
    // O filtro por tenantId do grupo impede que um sourcePartId forjado de outro
    // tenant influencie compras, reservas ou baixas de estoque.
    const [parts, stocks] = await Promise.all([
      tx.part.findMany({
        where: { id: { in: partIds }, tenantId: groupId },
        select: { id: true, costPrice: true, supplierId: true },
      }),
      tx.partStock.findMany({
        where: { tenantId: branchId, partId: { in: partIds } },
        select: { partId: true, currentStock: true, reservedStock: true },
      }),
    ]);
    if (parts.length !== partIds.length) {
      throw new BadRequestException('A OS contém peça de catálogo inválida para este tenant');
    }

    const stockByPart = new Map(stocks.map((s) => [s.partId, s]));
    return parts.map((part) => ({
      partId: part.id,
      branchId,
      currentStock: dec(stockByPart.get(part.id)?.currentStock),
      reservedStock: dec(stockByPart.get(part.id)?.reservedStock),
      costPrice: dec(part.costPrice),
      supplierId: part.supplierId,
      needed: byPart.get(part.id) ?? 0,
    }));
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
    const needs = await this.orderPartNeeds(tx, orderId);
    if (needs.length === 0) return { shortfall: false };

    // Primeiro reivindica a reserva da OS de forma atômica. Se outra transação
    // já reservou esta OS, não incrementa novamente o estoque reservado.
    const claimed = await tx.serviceOrder.updateMany({
      where: { id: orderId, partsReserved: false },
      data: { partsReserved: true },
    });

    if (claimed.count !== 1) {
      // Idempotência defensiva: se a OS já estava reservada, apenas informa se
      // o conjunto de reservas atual deixou alguma peça descoberta.
      return {
        shortfall: needs.some((n) => round3(n.currentStock - n.reservedStock) < 0),
      };
    }

    let anyShortfall = false;
    for (const n of needs) {
      if (n.needed <= 0) continue;

      // Garante a linha de saldo antes do update condicional. Se a peça ainda
      // não possui saldo na filial, já há falta e a reserva será registrada.
      await tx.partStock.upsert({
        where: { tenantId_partId: { tenantId: n.branchId, partId: n.partId } },
        create: { tenantId: n.branchId, partId: n.partId, currentStock: 0, reservedStock: 0 },
        update: {},
      });

      // Reserva coberta: update atômico somente se ainda houver disponibilidade
      // no momento da gravação. Isso evita que duas OS simultâneas consumam a
      // mesma disponibilidade lógica.
      const covered = await tx.$executeRaw`
        UPDATE "part_stock"
        SET "reservedStock" = "reservedStock" + ${n.needed}, "updatedAt" = NOW()
        WHERE "tenantId" = ${n.branchId}
          AND "partId" = ${n.partId}
          AND ("currentStock" - "reservedStock") >= ${n.needed}
      `;

      if (Number(covered) === 1) {
        await tx.stockReservation.create({
          data: {
            tenantId: n.branchId,
            serviceOrderId: orderId,
            partId: n.partId,
            quantity: n.needed,
            status: 'ACTIVE',
            reason: 'Reserva coberta por estoque disponível',
          },
        });
        continue;
      }

      // Reserva descoberta: mantém a reserva da OS para refletir a demanda real
      // e sinaliza a necessidade de compra/backorder.
      anyShortfall = true;
      await tx.partStock.updateMany({
        where: { tenantId: n.branchId, partId: n.partId },
        data: { reservedStock: { increment: n.needed } },
      });
      await tx.stockReservation.create({
        data: {
          tenantId: n.branchId,
          serviceOrderId: orderId,
          partId: n.partId,
          quantity: n.needed,
          status: 'ACTIVE',
          reason: 'Reserva descoberta aguardando compra/backorder',
        },
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
      throw new BadRequestException('Gere o pedido de compra após a aprovação do orçamento.');
    }

    const needs = await this.orderPartNeeds(this.prisma, orderId);
    const lines = needs
      .map((n) => {
        const uncovered = round3(Math.max(0, n.reservedStock - n.currentStock));
        return {
          partId: n.partId,
          supplierId: n.supplierId,
          qty: round3(Math.min(n.needed, uncovered)),
          costPrice: n.costPrice,
        };
      })
      .filter((l) => l.qty > 0);

    if (lines.length === 0) {
      throw new BadRequestException(
        'Todas as peças aprovadas já estão em estoque — não é necessário comprar.',
      );
    }

    const created = await this.withPurchaseNumberRetry(() =>
      this.prisma.$transaction(async (tx) => {
        await this.cancelOpenOrderPurchases(tx, orderId);
        return this.createGroupedPurchases(tx, actor.tenantId, lines, {
          serviceOrderId: orderId,
          notes: 'Peças aprovadas em falta na OS',
        });
      }),
    );

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

  /** Fecha as reservas formais da OS e atualiza o agregado part_stock.reservedStock. */
  private async closeOrderReservations(
    tx: Tx,
    orderId: string,
    status: 'RELEASED' | 'CONSUMED' | 'CANCELED',
  ): Promise<void> {
    const active = await tx.stockReservation.findMany({
      where: { serviceOrderId: orderId, status: 'ACTIVE' },
      select: { id: true, tenantId: true, partId: true, quantity: true },
    });

    const lines =
      active.length > 0
        ? active.map((r) => ({
            id: r.id,
            branchId: r.tenantId,
            partId: r.partId,
            needed: dec(r.quantity),
          }))
        : (await this.orderPartNeeds(tx, orderId)).map((n) => ({
            id: null,
            branchId: n.branchId,
            partId: n.partId,
            needed: n.needed,
          }));

    for (const line of lines) {
      if (line.needed <= 0) continue;
      await tx.$executeRaw`
        UPDATE "part_stock"
        SET "reservedStock" = GREATEST(0, "reservedStock" - ${line.needed}), "updatedAt" = NOW()
        WHERE "tenantId" = ${line.branchId}
          AND "partId" = ${line.partId}
      `;
    }

    if (active.length > 0) {
      const now = new Date();
      await tx.stockReservation.updateMany({
        where: { id: { in: active.map((r) => r.id) }, status: 'ACTIVE' },
        data: {
          status,
          ...(status === 'RELEASED' ? { releasedAt: now } : {}),
          ...(status === 'CONSUMED' ? { consumedAt: now } : {}),
          ...(status === 'CANCELED' ? { canceledAt: now } : {}),
        },
      });
    }
  }

  /** Libera a reserva de estoque das peças da OS (reabertura/cancelamento). */
  async releaseOrderReservations(tx: Tx, orderId: string): Promise<void> {
    const order = await tx.serviceOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { partsReserved: true },
    });
    if (!order.partsReserved) return;

    // Reivindica a liberação para impedir decremento duplo em reabertura,
    // cancelamento ou execução concorrente da mesma OS.
    const claimed = await tx.serviceOrder.updateMany({
      where: { id: orderId, partsReserved: true },
      data: { partsReserved: false },
    });
    if (claimed.count !== 1) return;

    await this.closeOrderReservations(tx, orderId, 'RELEASED');
  }

  /** Reabertura/cancelamento da OS: cancela compras em aberto e libera reservas. */
  async unwindOrderBackorder(tx: Tx, orderId: string): Promise<void> {
    await this.cancelOpenOrderPurchases(tx, orderId);
    await this.releaseOrderReservations(tx, orderId);
  }

  /** O estoque já cobre todas as reservas das peças da OS (disponível ≥ 0)? */
  async isOrderStockCovered(tx: Tx, orderId: string): Promise<boolean> {
    const needs = await this.orderPartNeeds(tx, orderId);
    return needs.every((n) => n.currentStock - n.reservedStock >= 0);
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
        partId: n.partId,
        type: 'CONSUMO_OS',
        quantity: n.needed,
        unitCost: n.costPrice,
        note: 'Consumo em OS (execução)',
        serviceOrderId: orderId,
        userId,
      });
    }
    // A baixa consome a reserva (a peça saiu do estoque para a OS).
    const claimed = await tx.serviceOrder.updateMany({
      where: { id: orderId, partsReserved: true },
      data: { partsReserved: false },
    });
    if (claimed.count === 1) {
      await this.closeOrderReservations(tx, orderId, 'CONSUMED');
    }
    await this.replenishBelowMin(
      tx,
      tenantId,
      needs.map((n) => n.partId),
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
    const groupId = await this.groupOf(tx, tenantId);
    const [parts, stocks] = await Promise.all([
      tx.part.findMany({
        where: { id: { in: partIds }, tenantId: groupId },
        select: {
          id: true,
          minStock: true,
          costPrice: true,
          supplierId: true,
        },
      }),
      tx.partStock.findMany({
        where: { tenantId, partId: { in: partIds } },
        select: { partId: true, currentStock: true },
      }),
    ]);
    const currentByPart = new Map(stocks.map((s) => [s.partId, dec(s.currentStock)]));
    const lines: {
      partId: string;
      supplierId: string | null;
      qty: number;
      costPrice: number;
    }[] = [];
    for (const p of parts) {
      const deficit = round3(dec(p.minStock) - (currentByPart.get(p.id) ?? 0));
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
