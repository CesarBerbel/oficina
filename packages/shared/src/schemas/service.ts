import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const serviceDefaultPartSchema = z.object({
  partId: z.string().min(1),
  quantity: z.coerce.number().positive().max(99_999),
});

export const createServiceSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(160),
  category: optionalString(80),
  description: optionalString(2000),
  salePrice: z.coerce.number().min(0).max(9_999_999),
  cost: z.coerce.number().min(0).max(9_999_999).default(0),
  estimatedMinutes: z.coerce.number().int().min(0).max(100_000).optional(),
  active: z.boolean().default(true),
  defaultParts: z.array(serviceDefaultPartSchema).max(50).default([]),
});

export type CreateServiceInput = z.infer<typeof createServiceSchema>;

export const updateServiceSchema = createServiceSchema.partial();
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export const listServicesQuerySchema = paginationQuerySchema.extend({
  active: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'string' ? v === 'true' : v))
    .optional(),
});
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;

export interface ServiceDefaultPartDto {
  partId: string;
  partName: string;
  unit: string;
  quantity: number;
}

export interface ServiceDto {
  id: string;
  name: string;
  category: string | null;
  description: string | null;
  salePrice: number;
  cost: number;
  estimatedMinutes: number | null;
  active: boolean;
  defaultParts: ServiceDefaultPartDto[];
}
