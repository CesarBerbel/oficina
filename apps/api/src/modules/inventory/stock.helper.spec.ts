import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { applyStockMovement } from './stock.helper';

const part = {
  id: 'part-1',
  name: 'Filtro de óleo',
  unit: 'UN',
};

function createTxMock(options: { updateCount?: number; latestStock?: number } = {}) {
  const stock = options.latestStock ?? 7.5;
  const balance = { currentStock: new Prisma.Decimal(stock) };
  return {
    part: {
      findUnique: jest.fn().mockResolvedValue(part),
    },
    partStock: {
      updateMany: jest.fn().mockResolvedValue({ count: options.updateCount ?? 1 }),
      findUnique: jest.fn().mockResolvedValue(balance),
      findUniqueOrThrow: jest.fn().mockResolvedValue(balance),
      upsert: jest.fn().mockResolvedValue(balance),
    },
    stockMovement: {
      create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
    },
  };
}

describe('applyStockMovement (estoque por filial)', () => {
  it('baixa estoque de forma condicional para impedir saldo negativo em consumo de OS', async () => {
    const tx = createTxMock({ latestStock: 7.5 });

    const balance = await applyStockMovement(tx as never, {
      tenantId: 'tenant-1',
      partId: 'part-1',
      type: 'CONSUMO_OS',
      quantity: 2.5,
      serviceOrderId: 'os-1',
      userId: 'user-1',
    });

    expect(balance).toBe(7.5);
    expect(tx.partStock.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        partId: 'part-1',
        currentStock: { gte: 2.5 },
      },
      data: { currentStock: { decrement: 2.5 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        partId: 'part-1',
        type: 'CONSUMO_OS',
        quantity: 2.5,
        balanceAfter: 7.5,
        serviceOrderId: 'os-1',
        userId: 'user-1',
      }),
    });
  });

  it('rejeita consumo quando a atualização condicional não encontra saldo suficiente', async () => {
    const tx = createTxMock({ updateCount: 0, latestStock: 1 });

    await expect(
      applyStockMovement(tx as never, {
        tenantId: 'tenant-1',
        partId: 'part-1',
        type: 'SAIDA',
        quantity: 2,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('registra entrada de compra incrementando o saldo (upsert) e criando histórico', async () => {
    const tx = createTxMock({ latestStock: 15 });

    const balance = await applyStockMovement(tx as never, {
      tenantId: 'tenant-1',
      partId: 'part-1',
      type: 'COMPRA',
      quantity: 5,
      unitCost: 25.5,
      note: 'Recebimento do pedido de compra',
    });

    expect(balance).toBe(15);
    expect(tx.partStock.upsert).toHaveBeenCalledWith({
      where: { tenantId_partId: { tenantId: 'tenant-1', partId: 'part-1' } },
      create: { tenantId: 'tenant-1', partId: 'part-1', currentStock: 5 },
      update: { currentStock: { increment: 5 } },
      select: { currentStock: true },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'COMPRA',
        quantity: 5,
        unitCost: 25.5,
        balanceAfter: 15,
      }),
    });
  });

  it('permite ajuste absoluto sem criar saldo negativo', async () => {
    const tx = createTxMock({ latestStock: 3 });

    const balance = await applyStockMovement(tx as never, {
      tenantId: 'tenant-1',
      partId: 'part-1',
      type: 'AJUSTE',
      quantity: 3,
      setAbsolute: true,
    });

    expect(balance).toBe(3);
    expect(tx.partStock.upsert).toHaveBeenCalledWith({
      where: { tenantId_partId: { tenantId: 'tenant-1', partId: 'part-1' } },
      create: { tenantId: 'tenant-1', partId: 'part-1', currentStock: 3 },
      update: { currentStock: 3 },
    });
  });

  it('rejeita quantidade inválida antes de alterar o estoque', async () => {
    const tx = createTxMock();

    await expect(
      applyStockMovement(tx as never, {
        tenantId: 'tenant-1',
        partId: 'part-1',
        type: 'AJUSTE',
        quantity: -1,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(tx.part.findUnique).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });
});
