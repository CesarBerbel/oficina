import { z } from 'zod';
import { PurchaseOrderStatus } from '../enums/purchase-status.js';
import { paginationQuerySchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const purchaseItemInputSchema = z.object({
  partId: z.string().min(1),
  quantity: z.coerce.number().positive().max(9_999_999),
  unitCost: z.coerce.number().min(0).max(9_999_999).default(0),
});

export const createPurchaseSchema = z.object({
  supplierId: optionalString(40),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal('').transform(() => undefined)),
  notes: optionalString(1000),
  items: z.array(purchaseItemInputSchema).min(1, 'Adicione ao menos um item'),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

/** Recebimento: quantidade recebida por item. */
export const receivePurchaseSchema = z.object({
  received: z
    .array(
      z.object({
        itemId: z.string().min(1),
        quantity: z.coerce.number().min(0).max(9_999_999),
      }),
    )
    .min(1),
});
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>;

export const listPurchasesQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(PurchaseOrderStatus).optional(),
});
export type ListPurchasesQuery = z.infer<typeof listPurchasesQuerySchema>;

export interface PurchaseItemDto {
  id: string;
  partId: string;
  partName: string;
  unit: string;
  quantity: number;
  receivedQuantity: number;
  unitCost: number;
  total: number;
}

export interface PurchaseOrderSummaryDto {
  id: string;
  number: number;
  status: PurchaseOrderStatus;
  supplierId: string | null;
  supplierName: string | null;
  /** OS que originou o pedido (compra automática por falta de peça), se houver. */
  serviceOrderId: string | null;
  serviceOrderNumber: number | null;
  itemsCount: number;
  total: number;
  dueDate: string | null;
  createdAt: string;
}

export interface PurchaseOrderDto extends PurchaseOrderSummaryDto {
  notes: string | null;
  items: PurchaseItemDto[];
}
