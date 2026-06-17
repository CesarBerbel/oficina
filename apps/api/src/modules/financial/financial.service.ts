import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FinancialEntryStatus,
  FinancialEntryType,
  type CreateFinancialEntryInput,
  type FinancialEntryDto,
  type FinancialSummaryDto,
  type ListFinancialEntriesQuery,
  type Paginated,
  type PayFinancialEntryInput,
  type SyncPurchaseFinancialInput,
  type SyncServiceOrderFinancialInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { calculateFinancialSettlement } from './financial.helper';

const dec = (value: Prisma.Decimal | number | null | undefined): number =>
  value == null ? 0 : Number(value);
const money = (value: number): Prisma.Decimal => new Prisma.Decimal(Math.round(value * 100) / 100);
const addDays = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

const include = {
  customer: { select: { id: true, name: true } },
  supplier: { select: { id: true, name: true } },
  serviceOrder: { select: { id: true, number: true } },
  purchaseOrder: { select: { id: true, number: true } },
  payments: { orderBy: { paidAt: 'desc' as const } },
} satisfies Prisma.FinancialEntryInclude;

type EntryRow = Prisma.FinancialEntryGetPayload<{ include: typeof include }>;

@Injectable()
export class FinancialService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toDto(row: EntryRow): FinancialEntryDto {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(row.dueDate);
    due.setHours(0, 0, 0, 0);
    const status = row.status as FinancialEntryStatus;
    return {
      id: row.id,
      type: row.type as FinancialEntryType,
      status,
      origin: row.origin,
      description: row.description,
      category: row.category,
      customerId: row.customerId,
      customerName: row.customer?.name ?? null,
      supplierId: row.supplierId,
      supplierName: row.supplier?.name ?? null,
      serviceOrderId: row.serviceOrderId,
      serviceOrderNumber: row.serviceOrder?.number ?? null,
      purchaseOrderId: row.purchaseOrderId,
      purchaseOrderNumber: row.purchaseOrder?.number ?? null,
      issueDate: row.issueDate.toISOString(),
      dueDate: row.dueDate.toISOString(),
      amount: dec(row.amount),
      paidAmount: dec(row.paidAmount),
      remainingAmount: dec(row.remainingAmount),
      overdue:
        status !== FinancialEntryStatus.PAID &&
        status !== FinancialEntryStatus.CANCELED &&
        due < today,
      notes: row.notes,
      payments: row.payments.map((p) => ({
        id: p.id,
        amount: dec(p.amount),
        method: p.method,
        paidAt: p.paidAt.toISOString(),
        notes: p.notes,
      })),
      createdAt: row.createdAt.toISOString(),
    };
  }

  async summary(
    tenantId: string,
    period: { from?: string; to?: string },
  ): Promise<FinancialSummaryDto> {
    const from = period.from ? new Date(period.from) : addDays(-30);
    const to = period.to ? new Date(period.to) : addDays(30);
    const today = new Date();
    const [open, payments] = await Promise.all([
      this.prisma.financialEntry.findMany({
        where: { tenantId, status: { in: ['OPEN', 'PARTIAL'] } },
        select: { type: true, dueDate: true, remainingAmount: true },
      }),
      this.prisma.financialPayment.findMany({
        where: { tenantId, paidAt: { gte: from, lte: to }, entry: { status: { not: 'CANCELED' } } },
        include: { entry: { select: { type: true } } },
      }),
    ]);
    const sum = (rows: typeof open, type: string, overdue = false) =>
      rows
        .filter((r) => r.type === type && (!overdue || r.dueDate < today))
        .reduce((acc, r) => acc + dec(r.remainingAmount), 0);
    const received = payments
      .filter((p) => p.entry.type === 'RECEIVABLE')
      .reduce((acc, p) => acc + dec(p.amount), 0);
    const paid = payments
      .filter((p) => p.entry.type === 'PAYABLE')
      .reduce((acc, p) => acc + dec(p.amount), 0);
    const receivableOpen = sum(open, 'RECEIVABLE');
    const payableOpen = sum(open, 'PAYABLE');
    return {
      receivableOpen,
      payableOpen,
      overdueReceivable: sum(open, 'RECEIVABLE', true),
      overduePayable: sum(open, 'PAYABLE', true),
      receivedInPeriod: received,
      paidInPeriod: paid,
      netCashFlow: received - paid,
      projectedBalance: receivableOpen - payableOpen,
      openReceivablesCount: open.filter((r) => r.type === 'RECEIVABLE').length,
      openPayablesCount: open.filter((r) => r.type === 'PAYABLE').length,
    };
  }

  async list(
    tenantId: string,
    query: ListFinancialEntriesQuery,
  ): Promise<Paginated<FinancialEntryDto>> {
    const { page, pageSize, search, type, status, from, to } = query;
    const where: Prisma.FinancialEntryWhereInput = {
      tenantId,
      ...(type ? { type } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: 'insensitive' } },
              { category: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { supplier: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(from || to
        ? {
            dueDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.financialEntry.count({ where }),
      this.prisma.financialEntry.findMany({
        where,
        include,
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      data: rows.map((r) => this.toDto(r)),
      meta: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
    };
  }

  async findOne(tenantId: string, id: string): Promise<FinancialEntryDto> {
    const row = await this.prisma.financialEntry.findFirst({ where: { id, tenantId }, include });
    if (!row) throw new NotFoundException('Lançamento financeiro não encontrado');
    return this.toDto(row);
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateFinancialEntryInput,
  ): Promise<FinancialEntryDto> {
    const amount = money(input.amount);
    const row = await this.prisma.financialEntry.create({
      data: {
        tenantId: actor.tenantId,
        type: input.type,
        origin: 'MANUAL',
        description: input.description,
        category: input.category,
        customerId: input.customerId,
        supplierId: input.supplierId,
        dueDate: new Date(input.dueDate),
        amount,
        remainingAmount: amount,
        notes: input.notes,
      },
      include,
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'financial',
      action: 'create',
      entity: 'FinancialEntry',
      entityId: row.id,
      after: this.toDto(row),
    });
    return this.toDto(row);
  }

  async pay(
    actor: AuthenticatedUser,
    id: string,
    input: PayFinancialEntryInput,
  ): Promise<FinancialEntryDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.financialEntry.findFirst({ where: { id, tenantId: actor.tenantId } });
      if (!entry) throw new NotFoundException('Lançamento financeiro não encontrado');
      if (entry.status === 'CANCELED')
        throw new BadRequestException('Lançamento cancelado não pode receber baixa');
      if (entry.status === 'PAID') throw new BadRequestException('Lançamento já está quitado');
      const settlement = calculateFinancialSettlement({
        amount: dec(entry.amount),
        paidAmount: dec(entry.paidAmount),
        paymentAmount: input.amount,
      });
      await tx.financialPayment.create({
        data: {
          tenantId: actor.tenantId,
          entryId: id,
          amount: money(input.amount),
          method: input.method,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          notes: input.notes,
        },
      });
      return tx.financialEntry.update({
        where: { id },
        data: {
          paidAmount: money(settlement.paidAmount),
          remainingAmount: money(settlement.remainingAmount),
          status: settlement.status,
        },
        include,
      });
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'financial',
      action: 'pay',
      entity: 'FinancialEntry',
      entityId: id,
      after: this.toDto(row),
    });
    return this.toDto(row);
  }

  async cancel(actor: AuthenticatedUser, id: string): Promise<FinancialEntryDto> {
    const existing = await this.prisma.financialEntry.findFirst({
      where: { id, tenantId: actor.tenantId },
    });
    if (!existing) throw new NotFoundException('Lançamento financeiro não encontrado');
    if (existing.status === 'PAID' || dec(existing.paidAmount) > 0)
      throw new BadRequestException('Lançamento com baixa não pode ser cancelado');
    const row = await this.prisma.financialEntry.update({
      where: { id },
      data: { status: 'CANCELED', canceledAt: new Date(), remainingAmount: money(0) },
      include,
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'financial',
      action: 'cancel',
      entity: 'FinancialEntry',
      entityId: id,
      after: this.toDto(row),
    });
    return this.toDto(row);
  }

  async syncServiceOrder(
    actor: AuthenticatedUser,
    input: SyncServiceOrderFinancialInput,
  ): Promise<FinancialEntryDto> {
    const os = await this.prisma.serviceOrder.findFirst({
      where: { id: input.serviceOrderId, tenantId: actor.tenantId },
      include: { customer: { select: { name: true } } },
    });
    if (!os) throw new NotFoundException('OS não encontrada');
    const total = dec(os.total);
    if (total <= 0)
      throw new BadRequestException('OS sem total financeiro para gerar conta a receber');
    const amount = money(total);
    const row = await this.prisma.financialEntry.upsert({
      where: {
        tenantId_serviceOrderId_type: {
          tenantId: actor.tenantId,
          serviceOrderId: os.id,
          type: 'RECEIVABLE',
        },
      },
      create: {
        tenantId: actor.tenantId,
        type: 'RECEIVABLE',
        origin: 'SERVICE_ORDER',
        description: `Recebimento da OS #${os.number} - ${os.customer.name}`,
        category: 'Serviços',
        customerId: os.customerId,
        serviceOrderId: os.id,
        dueDate: input.dueDate ? new Date(input.dueDate) : addDays(0),
        amount,
        remainingAmount: amount,
      },
      update: {
        description: `Recebimento da OS #${os.number} - ${os.customer.name}`,
        customerId: os.customerId,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        amount,
        remainingAmount: amount,
      },
      include,
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'financial',
      action: 'sync-service-order',
      entity: 'FinancialEntry',
      entityId: row.id,
      after: this.toDto(row),
    });
    return this.toDto(row);
  }

  async syncPurchaseOrder(
    actor: AuthenticatedUser,
    input: SyncPurchaseFinancialInput,
  ): Promise<FinancialEntryDto> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: input.purchaseOrderId, tenantId: actor.tenantId },
      include: { supplier: { select: { name: true } } },
    });
    if (!po) throw new NotFoundException('Pedido de compra não encontrado');
    const total = dec(po.total);
    if (total <= 0)
      throw new BadRequestException('Pedido sem total financeiro para gerar conta a pagar');
    const amount = money(total);
    const supplierName = po.supplier?.name ?? 'sem fornecedor';
    const row = await this.prisma.financialEntry.upsert({
      where: {
        tenantId_purchaseOrderId_type: {
          tenantId: actor.tenantId,
          purchaseOrderId: po.id,
          type: 'PAYABLE',
        },
      },
      create: {
        tenantId: actor.tenantId,
        type: 'PAYABLE',
        origin: 'PURCHASE_ORDER',
        description: `Pagamento do pedido de compra #${po.number} - ${supplierName}`,
        category: 'Compras',
        supplierId: po.supplierId,
        purchaseOrderId: po.id,
        dueDate: input.dueDate ? new Date(input.dueDate) : (po.dueDate ?? addDays(7)),
        amount,
        remainingAmount: amount,
      },
      update: {
        description: `Pagamento do pedido de compra #${po.number} - ${supplierName}`,
        supplierId: po.supplierId,
        dueDate: input.dueDate ? new Date(input.dueDate) : (po.dueDate ?? undefined),
        amount,
        remainingAmount: amount,
      },
      include,
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'financial',
      action: 'sync-purchase-order',
      entity: 'FinancialEntry',
      entityId: row.id,
      after: this.toDto(row),
    });
    return this.toDto(row);
  }
}
