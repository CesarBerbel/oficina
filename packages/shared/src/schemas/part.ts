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

const optionalNcm = z
  .string()
  .trim()
  .optional()
  .transform((v) => {
    const digits = v?.replace(/\D/g, '') ?? '';
    return digits === '' ? undefined : digits;
  })
  .refine((v) => v === undefined || v.length === 8, 'NCM deve ter 8 dígitos');

export const PART_UNITS = [
  'UN',
  'PC',
  'PAR',
  'JG',
  'KIT',
  'CX',
  'M',
  'CM',
  'L',
  'ML',
  'KG',
  'G',
] as const;

export type PartUnit = (typeof PART_UNITS)[number];

export const PART_UNIT_LABELS: Record<PartUnit, string> = {
  UN: 'Unidade',
  PC: 'Peça',
  PAR: 'Par',
  JG: 'Jogo',
  KIT: 'Kit',
  CX: 'Caixa',
  M: 'Metro',
  CM: 'Centímetro',
  L: 'Litro',
  ML: 'Mililitro',
  KG: 'Quilo',
  G: 'Grama',
};

export const createPartSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(160),
  sku: optionalString(60),
  ncm: optionalNcm,
  ean: optionalString(20),
  type: z.nativeEnum(PartType).default(PartType.PECA),
  category: optionalString(80),
  brand: optionalString(80),
  unit: z.enum(PART_UNITS).default('UN'),
  minStock: z.coerce.number().min(0).max(9_999_999).default(0),
  costPrice: z.coerce.number().min(0).max(9_999_999).default(0),
  salePrice: z.coerce.number().min(0).max(9_999_999).default(0),
  supplier: optionalString(120),
  supplierId: optionalString(40),
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
  ncm: string | null;
  ean: string | null;
  type: PartType;
  category: string | null;
  brand: string | null;
  unit: string;
  currentStock: number;
  /** Quantidade reservada para OS aprovadas (ainda não consumida). */
  reservedStock: number;
  /** Disponível para novas reservas = currentStock - reservedStock. */
  availableStock: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  supplier: string | null;
  supplierId: string | null;
  supplierName: string | null;
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
