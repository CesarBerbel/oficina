'use client';

import { useQuery } from '@tanstack/react-query';
import type { ActionItem, DashboardMetrics, DashboardProductivityDto } from '@oficina/shared';
import { api } from '@/lib/api';

export function useDashboardMetrics() {
  return useQuery({
    queryKey: ['dashboard', 'metrics'],
    queryFn: () => api.get<DashboardMetrics>('/dashboard/metrics'),
    refetchInterval: 60_000,
  });
}

export function useDashboardActions() {
  return useQuery({
    queryKey: ['dashboard', 'actions'],
    queryFn: () => api.get<ActionItem[]>('/dashboard/actions'),
    refetchInterval: 60_000,
  });
}

export function useDashboardProductivity() {
  return useQuery({
    queryKey: ['dashboard', 'productivity'],
    queryFn: () => api.get<DashboardProductivityDto>('/dashboard/productivity'),
    refetchInterval: 60_000,
  });
}
