import { BadRequestException } from '@nestjs/common';
import { Prisma, type PrismaClient, type StockMovementType } from '@prisma/client';

type Tx = Prisma.TransactionClient | PrismaClient;

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

const SIGN: Record<StockMovementType, 1 | -1> = {
  ENTRADA: 1,
  SAIDA: -1,
  AJUSTE: 1,
  CONSUMO_OS: -1,
  COMPRA: 1,
  ESTORNO: 1,
};

export interface ApplyMovementParams {
  tenantId: string;
  partId: string;
  type: StockMovementType;
  /** Magnitude do movimento (sempre positiva). Para AJUSTE com setAbsolute, é o novo saldo. */
  quantity: number;
  unitCost?: number | null;
  note?: string | null;
  serviceOrderId?: string | null;
  userId?: string | null;
  /** Para AJUSTE: define o saldo absoluto em vez de somar/subtrair. */
  setAbsolute?: boolean;
}

/**
 * Aplica uma movimentação de estoque dentro de uma transação: atualiza o saldo
 * da peça e registra o histórico. Saídas/consumos usam atualização condicional
 * atômica para impedir saldo negativo mesmo sob requisições concorrentes.
 */
export async function applyStockMovement(
  tx: Tx,
  params: ApplyMovementParams,
): Promise<number> {
  const quantity = round3(params.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new BadRequestException('Quantidade de estoque inválida');
  }

  const part = await tx.part.findFirst({
    where: { id: params.partId, tenantId: params.tenantId },
    select: { id: true, name: true, unit: true, currentStock: true },
  });
  if (!part) {
    throw new Error('Peça não encontrada para movimentação de estoque');
  }

  let newBalance: number;

  if (params.setAbsolute) {
    newBalance = quantity;
    if (newBalance < 0) {
      throw new BadRequestException('Estoque não pode ficar negativo');
    }
    await tx.part.update({
      where: { id: part.id },
      data: { currentStock: newBalance },
    });
  } else if (SIGN[params.type] === -1) {
    const updated = await tx.part.updateMany({
      where: {
        id: part.id,
        tenantId: params.tenantId,
        currentStock: { gte: quantity },
      },
      data: { currentStock: { decrement: quantity } },
    });

    if (updated.count !== 1) {
      const latest = await tx.part.findFirst({
        where: { id: part.id, tenantId: params.tenantId },
        select: { currentStock: true },
      });
      const available = dec(latest?.currentStock ?? part.currentStock);
      throw new BadRequestException(
        `Estoque insuficiente de "${part.name}": disponível ${round3(available)} ${part.unit}, ` +
          `necessário ${quantity} ${part.unit}.`,
      );
    }

    const updatedPart = await tx.part.findUniqueOrThrow({
      where: { id: part.id },
      select: { currentStock: true },
    });
    newBalance = round3(dec(updatedPart.currentStock));
  } else {
    const updatedPart = await tx.part.update({
      where: { id: part.id },
      data: { currentStock: { increment: quantity } },
      select: { currentStock: true },
    });
    newBalance = round3(dec(updatedPart.currentStock));
  }

  await tx.stockMovement.create({
    data: {
      tenantId: params.tenantId,
      partId: params.partId,
      type: params.type,
      quantity,
      unitCost: params.unitCost ?? null,
      balanceAfter: newBalance,
      note: params.note ?? null,
      serviceOrderId: params.serviceOrderId ?? null,
      userId: params.userId ?? null,
    },
  });

  return newBalance;
}
