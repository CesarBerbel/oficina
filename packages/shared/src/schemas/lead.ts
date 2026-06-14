import { z } from 'zod';
import {
  LeadConflictLevel,
  LeadContactChannel,
  LeadContactOutcome,
  LeadStatus,
} from '../enums/lead.js';
import { paginationQuerySchema, placaSchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === '' ? undefined : value));

const optionalDateTime = z
  .string()
  .datetime({ offset: true })
  .optional()
  .or(z.literal('').transform(() => undefined));

const optionalPlateSchema = z
  .union([placaSchema, z.literal('').transform(() => undefined)])
  .optional();

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
  plate: optionalPlateSchema,
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

export const registerLeadContactSchema = z.object({
  channel: z.nativeEnum(LeadContactChannel),
  outcome: z.nativeEnum(LeadContactOutcome),
  notes: optionalString(2000),
  nextFollowUpAt: optionalDateTime,
});
export type RegisterLeadContactInput = z.infer<
  typeof registerLeadContactSchema
>;

export const linkLeadCustomerSchema = z.object({
  customerId: z.string().min(1, 'Informe o cliente'),
});
export type LinkLeadCustomerInput = z.infer<typeof linkLeadCustomerSchema>;

export const linkLeadVehicleSchema = z.object({
  vehicleId: z.string().min(1, 'Informe o veículo'),
});
export type LinkLeadVehicleInput = z.infer<typeof linkLeadVehicleSchema>;

export const convertLeadToServiceOrderSchema = z.object({
  customerId: z.string().optional(),
  customer: z
    .object({
      name: z.string().trim().min(2).max(160),
      phone: optionalString(40),
      whatsapp: optionalString(40),
      email: z
        .string()
        .trim()
        .toLowerCase()
        .email('E-mail inválido')
        .optional()
        .or(z.literal('').transform(() => undefined)),
      notes: optionalString(2000),
    })
    .optional(),
  vehicleId: z.string().optional(),
  vehicle: z
    .object({
      plate: placaSchema,
      manufacturer: z.string().trim().min(1).max(60),
      model: z.string().trim().min(1).max(80),
      modelYear: z.coerce.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
      color: optionalString(40),
      currentKm: z.coerce.number().int().min(0).max(9_999_999).optional(),
      notes: optionalString(2000),
    })
    .optional(),
  technicianId: optionalString(40),
  km: z.coerce.number().int().min(0).max(9_999_999).optional(),
  dueDate: optionalDateTime,
  reportedProblem: optionalString(4000),
});
export type ConvertLeadToServiceOrderInput = z.infer<
  typeof convertLeadToServiceOrderSchema
>;

export interface LeadCustomerSuggestionDto {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  score: number;
  reason: string;
}

export interface LeadVehicleMatchDto {
  id: string;
  plate: string;
  manufacturer: string;
  model: string;
  modelYear: number | null;
  customerId: string;
  customerName: string;
}

export interface LeadContactAttemptDto {
  id: string;
  channel: LeadContactChannel;
  outcome: LeadContactOutcome;
  notes: string | null;
  nextFollowUpAt: string | null;
  userName: string | null;
  createdAt: string;
}

export interface LeadEventDto {
  id: string;
  type: string;
  title: string;
  description: string | null;
  userName: string | null;
  createdAt: string;
}

export interface LeadDto {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  plate: string | null;
  vehicle: string | null;
  message: string;
  status: LeadStatus;
  assignedToId: string | null;
  assignedToName: string | null;
  matchedCustomerId: string | null;
  matchedVehicleId: string | null;
  convertedCustomerId: string | null;
  convertedVehicleId: string | null;
  convertedServiceOrderId: string | null;
  conflictLevel: LeadConflictLevel;
  conflictReason: string | null;
  nextFollowUpAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadMatchSummaryDto {
  suggestedCustomers: LeadCustomerSuggestionDto[];
  vehicle: LeadVehicleMatchDto | null;
  conflictLevel: LeadConflictLevel;
  conflictReason: string | null;
}

export interface LeadDetailDto extends LeadDto {
  match: LeadMatchSummaryDto;
  contactAttempts: LeadContactAttemptDto[];
  events: LeadEventDto[];
}
