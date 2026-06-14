import { z } from 'zod';
import { placaSchema } from './common.js';
import type { ServiceOrderStatus } from '../enums/service-order-status.js';
import type { ServiceOrderItemKind } from '../enums/service-order-item.js';
import type { QuoteDto } from './quote.js';

/** Solicitação do código de acesso à área do cliente (informa a placa). */
export const garageRequestCodeSchema = z.object({
  plate: placaSchema,
});
export type GarageRequestCodeInput = z.infer<typeof garageRequestCodeSchema>;

/** Verificação do código de 6 dígitos para a placa. */
export const garageVerifyCodeSchema = z.object({
  plate: placaSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Informe o código de 6 dígitos.'),
});
export type GarageVerifyCodeInput = z.infer<typeof garageVerifyCodeSchema>;

/**
 * Resposta da solicitação de código. Genérica de propósito: não revela se a
 * placa existe nem se há e-mail (evita enumeração de placas).
 */
export interface GarageRequestCodeResult {
  ok: true;
}

/** Sessão emitida após validar o código — dá acesso ao histórico do veículo. */
export interface GarageSessionDto {
  token: string;
  expiresAt: string;
  shopName: string;
  customerName: string;
  vehicle: {
    plate: string;
    label: string;
  };
}

export interface GarageOrderItemDto {
  kind: ServiceOrderItemKind;
  description: string;
  quantity: number;
  total: number;
}

export interface GarageOrderTimelineDto {
  status: ServiceOrderStatus | null;
  title: string;
  note: string | null;
  photos: string[];
  createdAt: string;
}

/** Uma OS do veículo (atual ou anterior), com sua linha do tempo e serviços. */
export interface GarageOrderDto {
  id: string;
  number: number;
  status: ServiceOrderStatus;
  openedAt: string;
  closedAt: string | null;
  reportedProblem: string;
  diagnosis: string | null;
  total: number;
  /** Token público da OS, usado apenas para atalhos diretos já existentes. */
  publicToken: string;
  /** Orçamento da OS, quando gerado, integrado ao Portal do Cliente. */
  quote: QuoteDto | null;
  items: GarageOrderItemDto[];
  timeline: GarageOrderTimelineDto[];
}

/** Conteúdo da área privativa: dados do veículo + OS atual e anteriores. */
export interface GarageDataDto {
  shopName: string;
  customerName: string;
  vehicle: {
    plate: string;
    label: string;
    manufacturer: string;
    model: string;
    modelYear: number | null;
    currentKm: number | null;
  };
  current: GarageOrderDto | null;
  past: GarageOrderDto[];
}
