import { z } from 'zod';

const bool = z.boolean();
const intSetting = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const seasonalCampaignSchema = z.object({
  id: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(120),
  months: z.array(z.coerce.number().int().min(1).max(12)).min(1).max(12),
  title: z.string().trim().min(1).max(160),
  message: z.string().trim().min(1).max(600),
  vehicleAgeMinYears: z.coerce.number().int().min(0).max(80).optional().nullable(),
});

export const updateCrmSettingsSchema = z
  .object({
    enabled: bool.optional(),
    reviewIntervalDays: intSetting(15, 1200).optional(),
    reviewIntervalKm: intSetting(500, 50000).optional(),
    reviewKmWarning: intSetting(0, 10000).optional(),
    inactiveCustomerDays: intSetting(30, 3000).optional(),
    postDeliveryStartDays: intSetting(0, 180).optional(),
    postDeliveryEndDays: intSetting(1, 365).optional(),
    refusedQuoteRecoveryDays: intSetting(1, 365).optional(),
    refusedQuoteMinimumAgeDays: intSetting(0, 180).optional(),
    highPriorityDays: intSetting(30, 3000).optional(),
    mediumPriorityDays: intSetting(15, 3000).optional(),
    enablePreventiveReview: bool.optional(),
    enableKmReview: bool.optional(),
    enableInactiveCustomers: bool.optional(),
    enablePostDeliveryReturn: bool.optional(),
    enableRefusedQuoteRecovery: bool.optional(),
    enableRecommendedMaintenance: bool.optional(),
    enableSeasonalCampaigns: bool.optional(),
    recommendedMaintenanceKeywords: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    seasonalCampaigns: z.array(seasonalCampaignSchema).max(12).optional(),
  })
  .refine(
    (data) => {
      if (data.postDeliveryStartDays == null || data.postDeliveryEndDays == null) return true;
      return data.postDeliveryStartDays <= data.postDeliveryEndDays;
    },
    {
      message: 'O início do retorno pós-entrega deve ser menor ou igual ao fim.',
      path: ['postDeliveryStartDays'],
    },
  )
  .refine(
    (data) => {
      if (data.mediumPriorityDays == null || data.highPriorityDays == null) return true;
      return data.mediumPriorityDays <= data.highPriorityDays;
    },
    {
      message: 'Prioridade média deve ter prazo menor ou igual à alta.',
      path: ['mediumPriorityDays'],
    },
  );

export type UpdateCrmSettingsInput = z.infer<typeof updateCrmSettingsSchema>;

export interface CrmSeasonalCampaignDto {
  id: string;
  name: string;
  months: number[];
  title: string;
  message: string;
  vehicleAgeMinYears?: number | null;
}

export interface CrmSettingsDto {
  enabled: boolean;
  reviewIntervalDays: number;
  reviewIntervalKm: number;
  reviewKmWarning: number;
  inactiveCustomerDays: number;
  postDeliveryStartDays: number;
  postDeliveryEndDays: number;
  refusedQuoteRecoveryDays: number;
  refusedQuoteMinimumAgeDays: number;
  highPriorityDays: number;
  mediumPriorityDays: number;
  enablePreventiveReview: boolean;
  enableKmReview: boolean;
  enableInactiveCustomers: boolean;
  enablePostDeliveryReturn: boolean;
  enableRefusedQuoteRecovery: boolean;
  enableRecommendedMaintenance: boolean;
  enableSeasonalCampaigns: boolean;
  recommendedMaintenanceKeywords: string[];
  seasonalCampaigns: CrmSeasonalCampaignDto[];
}

export type PostSaleOpportunityKind =
  | 'REVISAO_PREVENTIVA'
  | 'REVISAO_KM'
  | 'CLIENTE_INATIVO'
  | 'RETORNO_POS_ENTREGA'
  | 'ORCAMENTO_RECUSADO'
  | 'MANUTENCAO_RECOMENDADA'
  | 'CAMPANHA_SAZONAL';

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
  currentKm?: number | null;
  nextReviewKm?: number | null;
  kmUntilReview?: number | null;
  estimatedValue?: number | null;
  campaignName?: string | null;
}

export interface PostSaleSummaryDto {
  total: number;
  highPriority: number;
  preventiveReview: number;
  kmReview: number;
  inactiveCustomers: number;
  postDeliveryReturn: number;
  refusedQuotes: number;
  recommendedMaintenance: number;
  seasonalCampaigns: number;
}

export interface PostSaleDto {
  generatedAt: string;
  settings: CrmSettingsDto;
  summary: PostSaleSummaryDto;
  opportunities: PostSaleOpportunityDto[];
}
