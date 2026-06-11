import { z } from 'zod';
import { cpfCnpjSchema, paginationQuerySchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const createSupplierSchema = z.object({
  name: z.string().trim().min(2, 'Nome: informe pelo menos 2 caracteres').max(160),
  document: cpfCnpjSchema.optional(),
  phone: optionalString(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  notes: optionalString(1000),
  active: z.boolean().default(true),
});
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

export const updateSupplierSchema = createSupplierSchema.partial();
export type UpdateSupplierInput = z.infer<typeof updateSupplierSchema>;

export const listSuppliersQuerySchema = paginationQuerySchema;
export type ListSuppliersQuery = z.infer<typeof listSuppliersQuerySchema>;

export interface SupplierDto {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  active: boolean;
}
