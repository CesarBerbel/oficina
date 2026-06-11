import { z } from 'zod';
import { LeadStatus } from '../enums/lead.js';
import { paginationQuerySchema } from './common.js';

/** Formulário público (orçamento/contato do site). */
export const createLeadSchema = z.object({
  name: z.string().trim().min(2, 'Informe seu nome').max(160),
  phone: z.string().trim().min(8, 'Informe um telefone').max(40),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido')
    .optional()
    .or(z.literal('').transform(() => undefined)),
  vehicle: z.string().trim().max(120).optional(),
  message: z.string().trim().min(3, 'Descreva sua necessidade').max(2000),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadStatusSchema = z.object({
  status: z.nativeEnum(LeadStatus),
});
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;

export const listLeadsQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(LeadStatus).optional(),
});
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;

export interface LeadDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  vehicle: string | null;
  message: string;
  status: LeadStatus;
  createdAt: string;
}
