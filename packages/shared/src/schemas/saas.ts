import { z } from 'zod';

export const planFeatureKeySchema = z.enum([
  'USERS',
  'BRANCHES',
  'SERVICE_ORDERS_MONTH',
  'UPLOADS_MONTH',
  'STORAGE_MB',
  'AI_MONTH',
  'MESSAGES_MONTH',
  'CUSTOM_DOMAINS',
]);
export type PlanFeatureKey = z.infer<typeof planFeatureKeySchema>;

export const PLAN_FEATURE_LABELS: Record<PlanFeatureKey, string> = {
  USERS: 'Usuários ativos',
  BRANCHES: 'Oficinas/filiais',
  SERVICE_ORDERS_MONTH: 'OS por mês',
  UPLOADS_MONTH: 'Uploads por mês',
  STORAGE_MB: 'Armazenamento (MB)',
  AI_MONTH: 'Usos de IA por mês',
  MESSAGES_MONTH: 'Mensagens por mês',
  CUSTOM_DOMAINS: 'Domínios customizados',
};

export const upsertPlanSchema = z.object({
  code: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífens'),
  name: z.string().trim().min(2).max(120),
  description: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  active: z.boolean().optional(),
  priceCents: z.coerce.number().int().min(0).optional(),
  currency: z.string().trim().length(3).default('BRL').optional(),
  billingInterval: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY').optional(),
  limits: z
    .array(
      z.object({
        feature: planFeatureKeySchema,
        enabled: z.boolean().default(true).optional(),
        limit: z.coerce.number().int().min(0).nullable().optional(),
      }),
    )
    .default([])
    .optional(),
});
export type UpsertPlanInput = z.infer<typeof upsertPlanSchema>;

export const assignAccountPlanSchema = z.object({
  planId: z.string().min(1),
  status: z.enum(['TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED']).default('ACTIVE').optional(),
  currentPeriodEnd: z.string().datetime().nullable().optional(),
  trialEndsAt: z.string().datetime().nullable().optional(),
});
export type AssignAccountPlanInput = z.infer<typeof assignAccountPlanSchema>;

export interface PlanLimitDto {
  feature: PlanFeatureKey;
  enabled: boolean;
  limit: number | null;
}

export interface PlanDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  active: boolean;
  priceCents: number;
  currency: string;
  billingInterval: 'MONTHLY' | 'YEARLY';
  limits: PlanLimitDto[];
  createdAt: string;
}

export interface AccountSubscriptionDto {
  id: string;
  accountId: string;
  planId: string;
  planCode: string;
  planName: string;
  status: 'TRIALING' | 'ACTIVE' | 'PAST_DUE' | 'CANCELED';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  trialEndsAt: string | null;
  createdAt: string;
}

export interface QuotaUsageItemDto {
  feature: PlanFeatureKey;
  label: string;
  enabled: boolean;
  limit: number | null;
  used: number;
  remaining: number | null;
  period: string;
  exceeded: boolean;
}

export interface AccountQuotaSummaryDto {
  accountId: string;
  accountName: string;
  plan: { id: string | null; code: string | null; name: string | null };
  subscription: AccountSubscriptionDto | null;
  usage: QuotaUsageItemDto[];
}
