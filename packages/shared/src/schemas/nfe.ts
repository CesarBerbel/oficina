import { z } from 'zod';
import { PartType } from '../enums/part.js';

/** Item lido do XML da NF-e (antes da conferência). */
export interface NfeParsedItem {
  cProd: string | null;
  ean: string | null;
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  total: number;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  /** Peça já existente localizada por SKU/EAN. */
  matchedPartId: string | null;
}

export interface NfeParseResult {
  supplierCnpj: string | null;
  supplierName: string | null;
  /** Fornecedor já cadastrado localizado pelo CNPJ. */
  matchedSupplierId: string | null;
  fileName: string | null;
  items: NfeParsedItem[];
}

/** Item conferido/editado pelo usuário antes de importar. */
export const nfeConfirmItemSchema = z.object({
  include: z.boolean().default(true),
  partId: z.string().optional(),
  sku: z.string().trim().max(60).optional(),
  ean: z.string().trim().max(20).optional(),
  name: z.string().trim().min(1).max(160),
  type: z.nativeEnum(PartType).default(PartType.PECA),
  category: z.string().trim().max(80).optional(),
  brand: z.string().trim().max(80).optional(),
  unit: z.string().trim().min(1).max(10).default('UN'),
  quantity: z.coerce.number().min(0).max(9_999_999).default(0),
  costPrice: z.coerce.number().min(0).max(9_999_999).default(0),
  salePrice: z.coerce.number().min(0).max(9_999_999).default(0),
  minStock: z.coerce.number().min(0).max(9_999_999).default(0),
  description: z.string().trim().max(2000).optional(),
});
export type NfeConfirmItem = z.infer<typeof nfeConfirmItemSchema>;

export const nfeConfirmSchema = z.object({
  items: z.array(nfeConfirmItemSchema).min(1, 'Nenhum item para importar'),
  /** true = cadastra/atualiza e dá entrada no estoque; false = só cadastra/atualiza. */
  registerStock: z.boolean().default(false),
  supplierName: z.string().trim().max(160).optional(),
});
export type NfeConfirmInput = z.infer<typeof nfeConfirmSchema>;

export interface NfeConfirmResult {
  created: number;
  updated: number;
  stockEntries: number;
}
