import { z } from 'zod';
import { ServiceOrderItemKind } from '../enums/service-order-item.js';
import { ServiceOrderStatus } from '../enums/service-order-status.js';
import { paginationQuerySchema } from './common.js';
import type { QuoteDto } from './quote.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

export const createServiceOrderSchema = z.object({
  customerId: z.string().min(1, 'Selecione o cliente'),
  vehicleId: z.string().min(1, 'Selecione o veículo'),
  km: z.coerce.number().int().min(0).max(9_999_999).optional(),
  dueDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal('').transform(() => undefined)),
  technicianId: optionalString(40),
  reportedProblem: z.string().trim().min(3, 'Descreva o problema relatado').max(4000),
});

export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

/** Campos editáveis após abertura (relato/veículo/cliente/km ficam travados). */
export const updateServiceOrderSchema = z.object({
  diagnosis: optionalString(4000),
  notes: optionalString(4000),
  technicianId: optionalString(40),
  discount: z.coerce.number().min(0).max(9_999_999).optional(),
});

export type UpdateServiceOrderInput = z.infer<typeof updateServiceOrderSchema>;

export const changeStatusSchema = z.object({
  status: z.nativeEnum(ServiceOrderStatus),
  note: optionalString(500),
});

export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;

export const addItemSchema = z.object({
  kind: z.nativeEnum(ServiceOrderItemKind),
  description: z.string().trim().min(1, 'Informe a descrição').max(200),
  quantity: z.coerce.number().positive('Quantidade inválida').max(99_999),
  unitPrice: z.coerce.number().min(0).max(9_999_999),
  sourceServiceId: optionalString(40),
  sourcePartId: optionalString(40),
});

export type AddItemInput = z.infer<typeof addItemSchema>;

export const updateItemSchema = z.object({
  description: z.string().trim().min(1).max(200).optional(),
  quantity: z.coerce.number().positive().max(99_999).optional(),
  unitPrice: z.coerce.number().min(0).max(9_999_999).optional(),
  /** Vincular (id do serviço) ou desvincular (null) a peça de um serviço. */
  parentItemId: z.string().nullable().optional(),
});

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

/** Adicionar um serviço do catálogo (traz também as peças padrão dele). */
export const addServiceFromCatalogSchema = z.object({
  serviceId: z.string().min(1),
});
export type AddServiceFromCatalogInput = z.infer<
  typeof addServiceFromCatalogSchema
>;

/** Adicionar uma peça do catálogo (baixa estoque). */
export const addPartFromCatalogSchema = z.object({
  partId: z.string().min(1),
  quantity: z.coerce.number().positive().max(99_999).default(1),
});
export type AddPartFromCatalogInput = z.infer<typeof addPartFromCatalogSchema>;

/** Adicionar um combo: expande nos serviços (+ peças padrão); não aparece como combo. */
export const addComboToOrderSchema = z.object({
  comboId: z.string().min(1),
});
export type AddComboToOrderInput = z.infer<typeof addComboToOrderSchema>;

export const listServiceOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ServiceOrderStatus).optional(),
  technicianId: z.string().optional(),
  customerId: z.string().optional(),
});

export type ListServiceOrdersQuery = z.infer<
  typeof listServiceOrdersQuerySchema
>;

// ─── DTOs ───
export interface ServiceOrderItemDto {
  id: string;
  kind: ServiceOrderItemKind;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  comboLabel: string | null;
  /** Item de serviço ao qual esta peça está vinculada (se houver). */
  parentItemId: string | null;
  /** Descrição do serviço vinculado, para exibição. */
  linkedServiceName: string | null;
}

export interface ServiceOrderStatusHistoryDto {
  id: string;
  status: ServiceOrderStatus;
  note: string | null;
  userName: string | null;
  createdAt: string;
}

/** Resumo para listagem e kanban. */
export interface ServiceOrderSummaryDto {
  id: string;
  number: number;
  status: ServiceOrderStatus;
  customerId: string;
  customerName: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleLabel: string;
  technicianId: string | null;
  technicianName: string | null;
  total: number;
  openedAt: string;
  dueDate: string | null;
  isOverdue: boolean;
}

/** Detalhe completo da OS. */
export interface ServiceOrderDetailDto extends ServiceOrderSummaryDto {
  km: number | null;
  reportedProblem: string;
  diagnosis: string | null;
  notes: string | null;
  customerPhone: string | null;
  vehicleManufacturer: string;
  vehicleModel: string;
  vehicleModelYear: number | null;
  totalServices: number;
  totalParts: number;
  discount: number;
  items: ServiceOrderItemDto[];
  history: ServiceOrderStatusHistoryDto[];
  editable: boolean;
  publicToken: string;
  quote: QuoteDto | null;
}
