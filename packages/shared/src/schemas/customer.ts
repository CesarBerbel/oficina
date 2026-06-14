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


export type Customer360TimelineType =
  | 'CUSTOMER'
  | 'VEHICLE'
  | 'LEAD'
  | 'SERVICE_ORDER'
  | 'QUOTE'
  | 'CHECKIN'
  | 'MESSAGE'
  | 'CRM';

export interface Customer360KpisDto {
  vehicles: number;
  serviceOrders: number;
  openServiceOrders: number;
  deliveredServiceOrders: number;
  quotes: number;
  openLeads: number;
  crmOpportunities: number;
  totalSpent: number;
  averageTicket: number;
  lastVisitAt: string | null;
}

export interface Customer360VehicleDto {
  id: string;
  plate: string;
  manufacturer: string;
  model: string;
  modelYear: number | null;
  color: string | null;
  currentKm: number | null;
  notes: string | null;
  serviceOrdersCount: number;
  lastServiceOrderAt: string | null;
}

export interface Customer360ServiceOrderDto {
  id: string;
  number: number;
  status: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleLabel: string;
  technicianName: string | null;
  reportedProblem: string;
  total: number;
  openedAt: string;
  closedAt: string | null;
  updatedAt: string;
  quoteStatus: string | null;
}

export interface Customer360LeadDto {
  id: string;
  status: string;
  name: string;
  phone: string;
  plate: string | null;
  vehicle: string | null;
  message: string;
  appointmentStartAt: string | null;
  convertedServiceOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Customer360QuoteDto {
  id: string;
  serviceOrderId: string;
  serviceOrderNumber: number;
  status: string;
  total: number;
  decisionType: string | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface Customer360CheckinDto {
  id: string;
  serviceOrderId: string;
  serviceOrderNumber: number;
  vehiclePlate: string;
  km: number | null;
  photosCount: number;
  signedBy: string | null;
  createdAt: string;
}

export interface Customer360MessageDto {
  id: string;
  channel: string;
  event: string;
  status: string;
  to: string | null;
  body: string;
  createdAt: string;
}

export interface Customer360OpportunityDto {
  key: string;
  kind: string;
  title: string;
  reason: string;
  priority: 'baixa' | 'media' | 'alta';
  vehicleId: string | null;
  vehicleLabel: string | null;
  suggestedMessage: string;
}

export interface Customer360TimelineItemDto {
  id: string;
  type: Customer360TimelineType;
  title: string;
  description: string | null;
  href: string | null;
  occurredAt: string;
}

export interface Customer360Dto {
  customer: CustomerDto;
  kpis: Customer360KpisDto;
  vehicles: Customer360VehicleDto[];
  serviceOrders: Customer360ServiceOrderDto[];
  leads: Customer360LeadDto[];
  quotes: Customer360QuoteDto[];
  checkins: Customer360CheckinDto[];
  messages: Customer360MessageDto[];
  crmOpportunities: Customer360OpportunityDto[];
  timeline: Customer360TimelineItemDto[];
}
