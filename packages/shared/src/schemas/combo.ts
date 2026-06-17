import { z } from 'zod';
import { paginationQuerySchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/**
 * Combo é uma ORGANIZAÇÃO INTERNA para agrupar serviços.
 * Ao adicionar na OS, expande nos serviços que o compõem (e nas peças padrão
 * deles); o combo em si NÃO aparece para o cliente.
 */
export const createComboSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome').max(160),
  description: optionalString(2000),
  active: z.boolean().default(true),
  serviceIds: z.array(z.string().min(1)).min(1, 'Selecione ao menos um serviço').max(50),
});

export type CreateComboInput = z.infer<typeof createComboSchema>;

export const updateComboSchema = createComboSchema.partial();
export type UpdateComboInput = z.infer<typeof updateComboSchema>;

export const listCombosQuerySchema = paginationQuerySchema;
export type ListCombosQuery = z.infer<typeof listCombosQuerySchema>;

export interface ComboServiceDto {
  serviceId: string;
  serviceName: string;
  salePrice: number;
}

export interface ComboDto {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  services: ComboServiceDto[];
  /** Soma dos preços dos serviços (referência interna). */
  total: number;
}
