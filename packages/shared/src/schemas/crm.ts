export type PostSaleOpportunityKind =
  | 'REVISAO_PREVENTIVA'
  | 'CLIENTE_INATIVO'
  | 'RETORNO_POS_ENTREGA'
  | 'ORCAMENTO_RECUSADO';

export type PostSaleOpportunityPriority = 'alta' | 'media' | 'baixa';

export interface PostSaleOpportunityDto {
  key: string;
  kind: PostSaleOpportunityKind;
  priority: PostSaleOpportunityPriority;
  title: string;
  reason: string;
  suggestedMessage: string;
  customerId: string;
  customerName: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  serviceOrderId?: string | null;
  serviceOrderNumber?: number | null;
  lastServiceAt?: string | null;
  daysSinceLastService?: number | null;
  estimatedValue?: number | null;
}

export interface PostSaleSummaryDto {
  total: number;
  highPriority: number;
  preventiveReview: number;
  inactiveCustomers: number;
  postDeliveryReturn: number;
  refusedQuotes: number;
}

export interface PostSaleDto {
  generatedAt: string;
  summary: PostSaleSummaryDto;
  opportunities: PostSaleOpportunityDto[];
}
