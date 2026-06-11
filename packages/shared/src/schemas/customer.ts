import { z } from 'zod';
import { CustomerType } from '../enums/customer.js';
import { cpfCnpjSchema, paginationQuerySchema, phoneSchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

const customerBaseSchema = z.object({
  type: z.nativeEnum(CustomerType).default(CustomerType.PF),
  name: z.string().trim().min(2, 'Nome/Razão social: informe pelo menos 2 caracteres').max(160),
  document: cpfCnpjSchema.optional(),
  phone: phoneSchema.optional(),
  whatsapp: phoneSchema.optional(),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  zip: optionalString(12),
  street: optionalString(160),
  number: optionalString(20),
  complement: optionalString(80),
  district: optionalString(80),
  city: optionalString(80),
  state: optionalString(2),
  categories: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
  notes: optionalString(2000),
});

export const createCustomerSchema = customerBaseSchema.superRefine((data, ctx) => {
  if (!data.document) return;
  if (data.type === CustomerType.PF && data.document.length !== 11) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['document'],
      message: 'CPF: informe um CPF válido ou deixe em branco',
    });
  }
  if (data.type === CustomerType.PJ && data.document.length !== 14) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['document'],
      message: 'CNPJ: informe um CNPJ válido ou deixe em branco',
    });
  }
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = customerBaseSchema.partial().superRefine((data, ctx) => {
  if (!data.document || !data.type) return;
  if (data.type === CustomerType.PF && data.document.length !== 11) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['document'],
      message: 'CPF: informe um CPF válido ou deixe em branco',
    });
  }
  if (data.type === CustomerType.PJ && data.document.length !== 14) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['document'],
      message: 'CNPJ: informe um CNPJ válido ou deixe em branco',
    });
  }
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const listCustomersQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(CustomerType).optional(),
});
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;

export interface CustomerDto {
  id: string;
  type: CustomerType;
  name: string;
  document: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  zip: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  categories: string[];
  notes: string | null;
  vehiclesCount: number;
  createdAt: string;
}
