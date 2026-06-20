'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { AccountQuotaSummaryDto, PlanDto } from '@oficina/shared';
import { api } from '@/lib/api';

export function useBillingUsage() {
  return useQuery({
    queryKey: ['billing-usage'],
    queryFn: () => api.get<AccountQuotaSummaryDto>('/billing/usage'),
    refetchInterval: 60_000,
  });
}

/** Planos ativos disponíveis para o cliente (criados pelo super admin). */
export function useAccountPlans() {
  return useQuery({
    queryKey: ['account-plans'],
    queryFn: () => api.get<PlanDto[]>('/billing/plans'),
  });
}

/** A conta solicita upgrade para um plano (vai para aprovação do super admin). */
export function useRequestPlanUpgrade() {
  return useMutation({
    mutationFn: (planId: string) => api.post('/billing/upgrade-request', { planId }),
  });
}
