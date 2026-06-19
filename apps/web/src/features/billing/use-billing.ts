'use client';

import { useQuery } from '@tanstack/react-query';
import type { AccountQuotaSummaryDto } from '@oficina/shared';
import { api } from '@/lib/api';

export function useBillingUsage() {
  return useQuery({
    queryKey: ['billing-usage'],
    queryFn: () => api.get<AccountQuotaSummaryDto>('/billing/usage'),
    refetchInterval: 60_000,
  });
}
