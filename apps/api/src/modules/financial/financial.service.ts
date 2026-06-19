import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  FinancialEntryStatus,
  FinancialEntryType,
  type CreateFinancialEntryInput,
  type AccountingAccountDto,
  type AccountingIncomeStatementDto,
  type AccountingJournalDto,
  type AccountingTrialBalanceDto,
  type FinancialEntryDto,
  type FinancialLedgerEntryDto,
  type FinancialSummaryDto,
  type ListFinancialEntriesQuery,
  type Paginated,
  type PayFinancialEntryInput,
  type ReverseFinancialPaymentInput,
  type SyncPurchaseFinancialInput,
  type SyncServiceOrderFinancialInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';
import { PostAccountingJournalUseCase } from './use-cases/post-accounting-journal.usecase';

const dec = (value: Prisma.Decimal | number | null | undefined): number =>
  value == null ? 0 : Number(value);
const money = (value: number): Prisma.Decimal => new Prisma.Decimal(Math.round(value * 100) / 100);
const addDays = (days: number): Date => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Recalcula saldo/status ao re-sincronizar o valor de um lançamento, preservando
 * o que já foi pago (não zera baixas) e mantendo lançamentos cancelados.
 */
function resyncSettlement(
  amount: number,
  paidAmount: number,
  currentStatus: string,
): { remainingAmount: Prisma.Decimal; status: FinancialEntryStatus } {
  if (currentStatus === 'CANCELED') {
    return { remainingAmount: money(0), status: 'CANCELED' };
  }
  // Não permite re-sincronizar para um total menor do que já foi pago: isso
  // criaria um "saldo negativo" / pagamento a maior sem rastro. Bloqueia.
  if (Math.round((paidAmount - amount) * 100) > 0) {
    throw new BadRequestException(
      `Novo total (${amount.toFixed(2)}) é menor que o valor já pago (${paidAmount.toFixed(2)}). Estorne a baixa antes de reduzir o lançamento.`,
    );
  }
  const remaining = Math.max(0, Math.round((amount - paidAmount) * 100) / 100);
  const status: FinancialEntryStatus =
    remaining <= 0 ? 'PAID' : paidAmount > 0 ? 'PARTIAL' : 'OPEN';
  return { remainingAmount: money(remaining), status };
}

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
    private readonly postAccountingJournal: PostAccountingJournalUseCase,
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
        reversedAt: p.reversedAt?.toISOString() ?? null,
        reversalReason: p.reversalReason ?? null,
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
        where: {
          tenantId,
          reversedAt: null,
          paidAt: { gte: from, lte: to },
          entry: { status: { not: 'CANCELED' } },
        },
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

  /**
   * Posta um movimento imutável no ledger operacional e o lançamento contábil
   * correspondente por partidas dobradas (dentro da transação do chamador).
   */
  private async postLedger(
    tx: Prisma.TransactionClient,
    data: {
      tenantId: string;
      entryId: string;
      kind: 'ISSUE' | 'ADJUSTMENT' | 'PAYMENT' | 'PAYMENT_REVERSAL' | 'CANCELLATION';
      amount: number;
      description?: string | null;
      createdById?: string | null;
    },
  ): Promise<void> {
    await tx.financialLedgerEntry.create({
      data: {
        tenantId: data.tenantId,
        entryId: data.entryId,
        kind: data.kind,
        amount: money(data.amount),
        description: data.description ?? null,
        createdById: data.createdById ?? null,
      },
    });
    await this.postAccountingJournal.execute(tx, data);
  }

  /** Ledger (movimentos imutáveis) de um lançamento financeiro. */
  async ledger(tenantId: string, entryId: string): Promise<FinancialLedgerEntryDto[]> {
    const entry = await this.prisma.financialEntry.findFirst({
      where: { id: entryId, tenantId },
      select: { id: true },
    });
    if (!entry) throw new NotFoundException('Lançamento financeiro não encontrado');
    const rows = await this.prisma.financialLedgerEntry.findMany({
      where: { tenantId, entryId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      amount: dec(r.amount),
      description: r.description,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Journals contábeis de partidas dobradas ligados ao lançamento financeiro. */
  async accountingJournal(tenantId: string, entryId: string): Promise<AccountingJournalDto[]> {
    const entry = await this.prisma.financialEntry.findFirst({
      where: { id: entryId, tenantId },
      select: { id: true },
    });
    if (!entry) throw new NotFoundException('Lançamento financeiro não encontrado');

    const rows = await this.prisma.accountingJournalEntry.findMany({
      where: { tenantId, financialEntryId: entryId },
      include: {
        lines: {
          include: {
            debitAccount: { select: { code: true, name: true, type: true } },
            creditAccount: { select: { code: true, name: true, type: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return rows.map((journal) => ({
      id: journal.id,
      financialEntryId: journal.financialEntryId,
      kind: journal.kind,
      status: journal.status,
      description: journal.description,
      createdAt: journal.createdAt.toISOString(),
      lines: journal.lines.map((line) => ({
        id: line.id,
        debit: {
          id: line.debitAccountId,
          code: line.debitAccount.code,
          name: line.debitAccount.name,
          type: line.debitAccount.type,
          active: true,
        },
        credit: {
          id: line.creditAccountId,
          code: line.creditAccount.code,
          name: line.creditAccount.name,
          type: line.creditAccount.type,
          active: true,
        },
        amount: dec(line.amount),
        memo: line.memo,
      })),
    }));
  }

  async accountingAccounts(tenantId: string): Promise<AccountingAccountDto[]> {
    const rows = await this.prisma.accountingAccount.findMany({
      where: { tenantId },
      orderBy: [{ code: 'asc' }],
    });
    return rows.map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      active: a.active,
    }));
  }

  async accountingJournals(
    tenantId: string,
    period: { from?: string; to?: string },
  ): Promise<AccountingJournalDto[]> {
    const rows = await this.prisma.accountingJournalEntry.findMany({
      where: {
        tenantId,
        ...(period.from || period.to
          ? {
              createdAt: {
                ...(period.from ? { gte: new Date(period.from) } : {}),
                ...(period.to ? { lte: new Date(period.to) } : {}),
              },
            }
          : {}),
      },
      include: {
        lines: {
          include: {
            debitAccount: true,
            creditAccount: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map((journal) => ({
      id: journal.id,
      financialEntryId: journal.financialEntryId,
      kind: journal.kind,
      status: journal.status,
      description: journal.description,
      createdAt: journal.createdAt.toISOString(),
      lines: journal.lines.map((line) => ({
        id: line.id,
        debit: {
          id: line.debitAccount.id,
          code: line.debitAccount.code,
          name: line.debitAccount.name,
          type: line.debitAccount.type,
          active: line.debitAccount.active,
        },
        credit: {
          id: line.creditAccount.id,
          code: line.creditAccount.code,
          name: line.creditAccount.name,
          type: line.creditAccount.type,
          active: line.creditAccount.active,
        },
        amount: dec(line.amount),
        memo: line.memo,
      })),
    }));
  }

  async trialBalance(
    tenantId: string,
    period: { from?: string; to?: string },
  ): Promise<AccountingTrialBalanceDto> {
    const journals = await this.prisma.accountingJournalEntry.findMany({
      where: {
        tenantId,
        status: 'POSTED',
        ...(period.from || period.to
          ? {
              createdAt: {
                ...(period.from ? { gte: new Date(period.from) } : {}),
                ...(period.to ? { lte: new Date(period.to) } : {}),
              },
            }
          : {}),
      },
      include: { lines: { include: { debitAccount: true, creditAccount: true } } },
    });
    const byAccount = new Map<
      string,
      { account: AccountingAccountDto; debit: number; credit: number }
    >();
    const ensure = (a: {
      id: string;
      code: string;
      name: string;
      type: AccountingAccountDto['type'];
      active: boolean;
    }) => {
      const existing = byAccount.get(a.id);
      if (existing) return existing;
      const row = {
        account: { id: a.id, code: a.code, name: a.name, type: a.type, active: a.active },
        debit: 0,
        credit: 0,
      };
      byAccount.set(a.id, row);
      return row;
    };
    for (const journal of journals) {
      for (const line of journal.lines) {
        ensure(line.debitAccount).debit += dec(line.amount);
        ensure(line.creditAccount).credit += dec(line.amount);
      }
    }
    const rows = [...byAccount.values()]
      .map((r) => ({ ...r, balance: Math.round((r.debit - r.credit) * 100) / 100 }))
      .sort((a, b) => a.account.code.localeCompare(b.account.code));
    const totals = rows.reduce(
      (acc, r) => ({
        debit: acc.debit + r.debit,
        credit: acc.credit + r.credit,
        balance: acc.balance + r.balance,
      }),
      { debit: 0, credit: 0, balance: 0 },
    );
    return {
      from: period.from ?? null,
      to: period.to ?? null,
      rows,
      totals: {
        debit: Math.round(totals.debit * 100) / 100,
        credit: Math.round(totals.credit * 100) / 100,
        balance: Math.round(totals.balance * 100) / 100,
      },
    };
  }

  async incomeStatement(
    tenantId: string,
    period: { from?: string; to?: string },
  ): Promise<AccountingIncomeStatementDto> {
    const trial = await this.trialBalance(tenantId, period);
    const revenue = trial.rows
      .filter((r) => r.account.type === 'REVENUE')
      .reduce((acc, r) => acc + Math.max(0, r.credit - r.debit), 0);
    const expenses = trial.rows
      .filter((r) => r.account.type === 'EXPENSE')
      .reduce((acc, r) => acc + Math.max(0, r.debit - r.credit), 0);
    return {
      from: period.from ?? null,
      to: period.to ?? null,
      revenue: Math.round(revenue * 100) / 100,
      expenses: Math.round(expenses * 100) / 100,
      netIncome: Math.round((revenue - expenses) * 100) / 100,
    };
  }

  async reversePayment(
    actor: AuthenticatedUser,
    entryId: string,
    paymentId: string,
    input: ReverseFinancialPaymentInput,
  ): Promise<FinancialEntryDto> {
    const row = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.financialPayment.findFirst({
        where: { id: paymentId, entryId, tenantId: actor.tenantId, reversedAt: null },
        include: { entry: true },
      });
      if (!payment) throw new NotFoundException('Baixa ativa não encontrada');
      if (payment.entry.status === 'CANCELED') {
        throw new BadRequestException('Não é possível estornar baixa de lançamento cancelado');
      }
      const amount = dec(payment.amount);
      await tx.financialPayment.update({
        where: { id: payment.id },
        data: { reversedAt: new Date(), reversedById: actor.id, reversalReason: input.reason },
      });
      const newPaid = Math.max(0, dec(payment.entry.paidAmount) - amount);
      const newRemaining = dec(payment.entry.remainingAmount) + amount;
      await tx.financialEntry.update({
        where: { id: entryId },
        data: {
          paidAmount: money(newPaid),
          remainingAmount: money(newRemaining),
          status: newPaid <= 0 ? 'OPEN' : 'PARTIAL',
        },
      });
      await this.postLedger(tx, {
        tenantId: actor.tenantId,
        entryId,
        kind: 'PAYMENT_REVERSAL',
        amount,
        description: `Estorno de baixa: ${input.reason}`,
        createdById: actor.id,
      });
      return tx.financialEntry.findUniqueOrThrow({ where: { id: entryId }, include });
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'financial',
      action: 'reverse-payment',
      entity: 'FinancialPayment',
      entityId: paymentId,
      after: { entryId, reason: input.reason },
    });
    return this.toDto(row);
  }

  async create(
    actor: AuthenticatedUser,
    input: CreateFinancialEntryInput,
  ): Promise<FinancialEntryDto> {
    const amount = money(input.amount);
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.financialEntry.create({
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
      await this.postLedger(tx, {
        tenantId: actor.tenantId,
        entryId: created.id,
        kind: 'ISSUE',
        amount: dec(amount),
        description: 'Emissão do lançamento',
        createdById: actor.id,
      });
      return created;
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
    const paymentAmount = Math.round(input.amount * 100) / 100;
    if (paymentAmount <= 0) {
      throw new BadRequestException('Valor de baixa inválido');
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.financialEntry.findFirst({ where: { id, tenantId: actor.tenantId } });
      if (!entry) throw new NotFoundException('Lançamento financeiro não encontrado');
      if (entry.status === 'CANCELED') {
        throw new BadRequestException('Lançamento cancelado não pode receber baixa');
      }
      if (entry.status === 'PAID') throw new BadRequestException('Lançamento já está quitado');

      // Update condicional e atômico: impede overpayment em duas baixas
      // simultâneas e calcula o novo status no banco usando o saldo real no
      // momento do update.
      const updatedCount = await tx.$executeRaw`
        UPDATE "financial_entries"
        SET
          "paidAmount" = "paidAmount" + ${paymentAmount},
          "remainingAmount" = "remainingAmount" - ${paymentAmount},
          "status" = CASE
            WHEN "remainingAmount" - ${paymentAmount} <= 0 THEN 'PAID'::"FinancialEntryStatus"
            ELSE 'PARTIAL'::"FinancialEntryStatus"
          END,
          "updatedAt" = NOW()
        WHERE "id" = ${id}
          AND "tenantId" = ${actor.tenantId}
          AND "status" NOT IN ('CANCELED'::"FinancialEntryStatus", 'PAID'::"FinancialEntryStatus")
          AND "remainingAmount" >= ${paymentAmount}
      `;

      if (Number(updatedCount) !== 1) {
        const latest = await tx.financialEntry.findFirst({
          where: { id, tenantId: actor.tenantId },
          select: { status: true, remainingAmount: true },
        });
        if (!latest) throw new NotFoundException('Lançamento financeiro não encontrado');
        if (latest.status === 'PAID') throw new BadRequestException('Lançamento já está quitado');
        if (latest.status === 'CANCELED') {
          throw new BadRequestException('Lançamento cancelado não pode receber baixa');
        }
        throw new BadRequestException(
          `Valor de baixa excede o saldo restante (${dec(latest.remainingAmount).toFixed(2)}).`,
        );
      }

      await tx.financialPayment.create({
        data: {
          tenantId: actor.tenantId,
          entryId: id,
          amount: money(paymentAmount),
          method: input.method,
          paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
          notes: input.notes,
        },
      });
      // Movimento de baixa no ledger (reduz o saldo devido).
      await this.postLedger(tx, {
        tenantId: actor.tenantId,
        entryId: id,
        kind: 'PAYMENT',
        amount: -paymentAmount,
        description: `Baixa (${input.method})`,
        createdById: actor.id,
      });

      return tx.financialEntry.findUniqueOrThrow({ where: { id }, include });
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
    const remaining = dec(existing.remainingAmount);
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.financialEntry.update({
        where: { id },
        data: { status: 'CANCELED', canceledAt: new Date(), remainingAmount: money(0) },
        include,
      });
      if (remaining > 0) {
        await this.postLedger(tx, {
          tenantId: actor.tenantId,
          entryId: id,
          kind: 'CANCELLATION',
          amount: -remaining,
          description: 'Cancelamento do lançamento',
          createdById: actor.id,
        });
      }
      return updated;
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
    const description = `Recebimento da OS #${os.number} - ${os.customer.name}`;
    const existing = await this.prisma.financialEntry.findUnique({
      where: {
        tenantId_serviceOrderId_type: {
          tenantId: actor.tenantId,
          serviceOrderId: os.id,
          type: 'RECEIVABLE',
        },
      },
      select: { id: true, amount: true, paidAmount: true, status: true },
    });
    const row = await this.prisma.$transaction(async (tx) => {
      if (!existing) {
        const created = await tx.financialEntry.create({
          data: {
            tenantId: actor.tenantId,
            type: 'RECEIVABLE',
            origin: 'SERVICE_ORDER',
            description,
            category: 'Serviços',
            customerId: os.customerId,
            serviceOrderId: os.id,
            dueDate: input.dueDate ? new Date(input.dueDate) : addDays(0),
            amount,
            remainingAmount: amount,
          },
          include,
        });
        await this.postLedger(tx, {
          tenantId: actor.tenantId,
          entryId: created.id,
          kind: 'ISSUE',
          amount: total,
          description,
          createdById: actor.id,
        });
        return created;
      }
      const settlement = resyncSettlement(total, dec(existing.paidAmount), existing.status);
      const updated = await tx.financialEntry.update({
        where: { id: existing.id },
        data: {
          description,
          customerId: os.customerId,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          amount,
          remainingAmount: settlement.remainingAmount,
          status: settlement.status,
        },
        include,
      });
      const delta = total - dec(existing.amount);
      if (delta !== 0 && existing.status !== 'CANCELED') {
        await this.postLedger(tx, {
          tenantId: actor.tenantId,
          entryId: existing.id,
          kind: 'ADJUSTMENT',
          amount: delta,
          description: 'Ajuste de valor (sync OS)',
          createdById: actor.id,
        });
      }
      return updated;
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
    const description = `Pagamento do pedido de compra #${po.number} - ${supplierName}`;
    const existing = await this.prisma.financialEntry.findUnique({
      where: {
        tenantId_purchaseOrderId_type: {
          tenantId: actor.tenantId,
          purchaseOrderId: po.id,
          type: 'PAYABLE',
        },
      },
      select: { id: true, amount: true, paidAmount: true, status: true },
    });
    const row = await this.prisma.$transaction(async (tx) => {
      if (!existing) {
        const created = await tx.financialEntry.create({
          data: {
            tenantId: actor.tenantId,
            type: 'PAYABLE',
            origin: 'PURCHASE_ORDER',
            description,
            category: 'Compras',
            supplierId: po.supplierId,
            purchaseOrderId: po.id,
            dueDate: input.dueDate ? new Date(input.dueDate) : (po.dueDate ?? addDays(7)),
            amount,
            remainingAmount: amount,
          },
          include,
        });
        await this.postLedger(tx, {
          tenantId: actor.tenantId,
          entryId: created.id,
          kind: 'ISSUE',
          amount: total,
          description,
          createdById: actor.id,
        });
        return created;
      }
      const settlement = resyncSettlement(total, dec(existing.paidAmount), existing.status);
      const updated = await tx.financialEntry.update({
        where: { id: existing.id },
        data: {
          description,
          supplierId: po.supplierId,
          dueDate: input.dueDate ? new Date(input.dueDate) : (po.dueDate ?? undefined),
          amount,
          remainingAmount: settlement.remainingAmount,
          status: settlement.status,
        },
        include,
      });
      const delta = total - dec(existing.amount);
      if (delta !== 0 && existing.status !== 'CANCELED') {
        await this.postLedger(tx, {
          tenantId: actor.tenantId,
          entryId: existing.id,
          kind: 'ADJUSTMENT',
          amount: delta,
          description: 'Ajuste de valor (sync compra)',
          createdById: actor.id,
        });
      }
      return updated;
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
