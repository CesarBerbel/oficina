import type { ServiceOrderStatus } from '../enums/service-order-status.js';
import type { ServiceOrderItemKind } from '../enums/service-order-item.js';
import type { QuoteDto } from './quote.js';

export interface PublicTrackingItemDto {
  kind: ServiceOrderItemKind;
  description: string;
  quantity: number;
  unitPrice: number;
  /** Desconto por item (vem do orçamento; itens avulsos da OS = 0). */
  discountPercent: number;
  discountAmount: number;
  total: number;
}

export interface PublicTrackingTimelineDto {
  status: ServiceOrderStatus | null;
  title: string;
  description: string | null;
  photos: string[];
  createdAt: string;
}

/** Visão pública da OS para o cliente (somente leitura, sem dados sensíveis). */
export interface PublicTrackingDto {
  shopName: string;
  number: number;
  status: ServiceOrderStatus;
  openedAt: string;
  dueDate: string | null;
  customerName: string;
  vehicleLabel: string;
  vehiclePlate: string;
  reportedProblem: string;
  diagnosis: string | null;
  publicNotes: string | null;
  items: PublicTrackingItemDto[];
  totalServices: number;
  totalParts: number;
  discount: number;
  total: number;
  timeline: PublicTrackingTimelineDto[];
  /** Orçamento pendente de aprovação, quando houver. */
  quote: QuoteDto | null;
}
