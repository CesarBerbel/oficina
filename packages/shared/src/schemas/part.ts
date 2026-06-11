import { z } from 'zod';
import { PartType } from '../enums/part.js';
import { StockMovementType } from '../enums/stock-movement.js';
import { paginationQuerySchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const createPartSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(160),
  sku: optionalString(60),
  ean: optionalString(20),
  type: z.nativeEnum(PartType).default(PartType.PECA),
  category: optionalString(80),
  brand: optionalString(80),
  unit: z.string().trim().min(1).max(10).default('UN'),
  minStock: z.coerce.number().min(0).max(9_999_999).default(0),
  costPrice: z.coerce.number().min(0).max(9_999_999).default(0),
  salePrice: z.coerce.number().min(0).max(9_999_999).default(0),
  supplier: optionalString(120),
  description: optionalString(2000),
  active: z.boolean().default(true),
  /** Estoque inicial (gera um movimento de ENTRADA). */
  initialStock: z.coerce.number().min(0).max(9_999_999).default(0),
});

export type CreatePartInput = z.infer<typeof createPartSchema>;

export const updatePartSchema = createPartSchema.partial().omit({
  initialStock: true,
});
export type UpdatePartInput = z.infer<typeof updatePartSchema>;

export const listPartsQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(PartType).optional(),
  lowStock: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional(),
});
export type ListPartsQuery = z.infer<typeof listPartsQuerySchema>;

/** Movimentação manual de estoque (entrada/saída/ajuste). */
export const stockMovementSchema = z.object({
  type: z.enum(['ENTRADA', 'SAIDA', 'AJUSTE'] as const),
  quantity: z.coerce.number().positive('Quantidade inválida').max(9_999_999),
  unitCost: z.coerce.number().min(0).max(9_999_999).optional(),
  note: optionalString(300),
});
export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export interface PartDto {
  id: string;
  name: string;
  sku: string | null;
  ean: string | null;
  type: PartType;
  category: string | null;
  brand: string | null;
  unit: string;
  currentStock: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  supplier: string | null;
  description: string | null;
  active: boolean;
  lowStock: boolean;
}

export interface StockMovementDto {
  id: string;
  type: StockMovementType;
  quantity: number;
  unitCost: number | null;
  balanceAfter: number;
  note: string | null;
  userName: string | null;
  createdAt: string;
}
