import { Prisma } from '@prisma/client';
import type { PurchaseOrderDto, PurchaseOrderSummaryDto } from '@oficina/shared';

/**
 * Formato de consulta (include), tipo de linha e mappers puros do pedido de
 * compra. Extraídos do service para reduzir seu tamanho.
 */

const dec = (v: Prisma.Decimal | number | null | undefined): number => (v == null ? 0 : Number(v));

export const purchaseInclude = {
  supplier: { select: { id: true, name: true } },
  serviceOrder: { select: { number: true } },
  items: { include: { part: { select: { name: true, unit: true } } } },
} satisfies Prisma.PurchaseOrderInclude;

export type PurchaseRow = Prisma.PurchaseOrderGetPayload<{ include: typeof purchaseInclude }>;

export function toSummaryDto(r: PurchaseRow): PurchaseOrderSummaryDto {
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

export function toDto(r: PurchaseRow): PurchaseOrderDto {
  return {
    ...toSummaryDto(r),
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
