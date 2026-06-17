'use client';

import { useQuery } from '@tanstack/react-query';
import type { SystemMetricsDto } from '@oficina/shared';
import { api } from '@/lib/api';

export function useSystemMetrics() {
  return useQuery({
    queryKey: ['metrics', 'system'],
    queryFn: () => api.get<SystemMetricsDto>('/metrics'),
    refetchInterval: 30_000,
  });
}
