import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { FinancialEntryType } from '@oficina/shared';

const money = (value: number): Prisma.Decimal => new Prisma.Decimal(Math.round(value * 100) / 100);

const ACCOUNTING_ACCOUNTS = {
  CASH: { name: 'Caixa/Bancos', type: 'ASSET' },
  ACCOUNTS_RECEIVABLE: { name: 'Clientes a receber', type: 'ASSET' },
  ACCOUNTS_PAYABLE: { name: 'Fornecedores a pagar', type: 'LIABILITY' },
  SERVICE_REVENUE: { name: 'Receita de serviços/vendas', type: 'REVENUE' },
  PURCHASE_EXPENSE: { name: 'Compras e custos operacionais', type: 'EXPENSE' },
} as const;

type AccountingCode = keyof typeof ACCOUNTING_ACCOUNTS;

interface AccountingLineInput {
  debit: AccountingCode;
  credit: AccountingCode;
  amount: number;
  memo?: string | null;
}

/**
 * Caso de uso para postar o reflexo contábil de um movimento financeiro.
 * O FinancialService continua orquestrando o lançamento operacional; este caso
 * de uso centraliza plano de contas mínimo e partidas dobradas.
 */
@Injectable()
export class PostAccountingJournalUseCase {
  private async ensureAccounts(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<Record<AccountingCode, string>> {
    const ids = {} as Record<AccountingCode, string>;
    for (const [code, cfg] of Object.entries(ACCOUNTING_ACCOUNTS) as [
      AccountingCode,
      (typeof ACCOUNTING_ACCOUNTS)[AccountingCode],
    ][]) {
      const account = await tx.accountingAccount.upsert({
        where: { tenantId_code: { tenantId, code } },
        create: { tenantId, code, name: cfg.name, type: cfg.type },
        update: { name: cfg.name, type: cfg.type, active: true },
        select: { id: true },
      });
      ids[code] = account.id;
    }
    return ids;
  }

  private linesFor(
    entryType: FinancialEntryType,
    kind: 'ISSUE' | 'ADJUSTMENT' | 'PAYMENT' | 'CANCELLATION',
    signedAmount: number,
  ): AccountingLineInput[] {
    const amount = Math.round(Math.abs(signedAmount) * 100) / 100;
    if (amount <= 0) return [];

    const issueLine = (reverse = false): AccountingLineInput => {
      if (entryType === FinancialEntryType.RECEIVABLE) {
        return reverse
          ? { debit: 'SERVICE_REVENUE', credit: 'ACCOUNTS_RECEIVABLE', amount }
          : { debit: 'ACCOUNTS_RECEIVABLE', credit: 'SERVICE_REVENUE', amount };
      }
      return reverse
        ? { debit: 'ACCOUNTS_PAYABLE', credit: 'PURCHASE_EXPENSE', amount }
        : { debit: 'PURCHASE_EXPENSE', credit: 'ACCOUNTS_PAYABLE', amount };
    };

    if (kind === 'ISSUE') return [issueLine(false)];
    if (kind === 'CANCELLATION') return [issueLine(true)];
    if (kind === 'ADJUSTMENT') return [issueLine(signedAmount < 0)];

    if (entryType === FinancialEntryType.RECEIVABLE) {
      return [{ debit: 'CASH', credit: 'ACCOUNTS_RECEIVABLE', amount }];
    }
    return [{ debit: 'ACCOUNTS_PAYABLE', credit: 'CASH', amount }];
  }

  async execute(
    tx: Prisma.TransactionClient,
    data: {
      tenantId: string;
      entryId: string;
      kind: 'ISSUE' | 'ADJUSTMENT' | 'PAYMENT' | 'CANCELLATION';
      amount: number;
      description?: string | null;
      createdById?: string | null;
    },
  ): Promise<void> {
    const entry = await tx.financialEntry.findUniqueOrThrow({
      where: { id: data.entryId },
      select: { type: true },
    });
    const lines = this.linesFor(entry.type as FinancialEntryType, data.kind, data.amount);
    if (lines.length === 0) return;

    const accounts = await this.ensureAccounts(tx, data.tenantId);
    const debitTotal = lines.reduce((acc, line) => acc + line.amount, 0);
    const creditTotal = lines.reduce((acc, line) => acc + line.amount, 0);
    if (Math.round((debitTotal - creditTotal) * 100) !== 0) {
      throw new BadRequestException('Lançamento contábil não fecha débitos e créditos');
    }

    await tx.accountingJournalEntry.create({
      data: {
        tenantId: data.tenantId,
        financialEntryId: data.entryId,
        kind: data.kind,
        description: data.description ?? null,
        createdById: data.createdById ?? null,
        lines: {
          create: lines.map((line) => ({
            debitAccountId: accounts[line.debit],
            creditAccountId: accounts[line.credit],
            amount: money(line.amount),
            memo: line.memo ?? data.description ?? null,
          })),
        },
      },
    });
  }
}
