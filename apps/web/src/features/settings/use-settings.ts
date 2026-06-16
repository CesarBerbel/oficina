'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AiConfigDto,
  AiUsageSummaryDto,
  AuditLogDto,
  ListAuditQuery,
  Paginated,
  ReportsSummary,
  UpdateAiConfigInput,
} from '@oficina/shared';
import { api } from '@/lib/api';

export function useAiConfig() {
  return useQuery({
    queryKey: ['ai-config'],
    queryFn: () => api.get<AiConfigDto>('/ai-config'),
  });
}

export function useUpdateAiConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAiConfigInput) => api.put<AiConfigDto>('/ai-config', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ai-config'] });
      qc.invalidateQueries({ queryKey: ['ai-usage'] });
    },
  });
}

export function useAiUsage() {
  return useQuery({
    queryKey: ['ai-usage'],
    queryFn: () => api.get<AiUsageSummaryDto>('/ai-config/usage'),
  });
}

export function useAudit(params: Partial<ListAuditQuery>) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  });
  const qsStr = sp.toString();
  return useQuery({
    queryKey: ['audit', params],
    queryFn: () => api.get<Paginated<AuditLogDto>>(`/audit${qsStr ? `?${qsStr}` : ''}`),
    placeholderData: keepPreviousData,
  });
}

export function useReports(periodDays = 180) {
  return useQuery({
    queryKey: ['reports', periodDays],
    queryFn: () => api.get<ReportsSummary>(`/reports/summary?periodDays=${periodDays}`),
  });
}
