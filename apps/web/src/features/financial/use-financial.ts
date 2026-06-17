'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateFinancialEntryInput,
  FinancialEntryDto,
  FinancialSummaryDto,
  ListFinancialEntriesQuery,
  Paginated,
  PayFinancialEntryInput,
  SyncPurchaseFinancialInput,
  SyncServiceOrderFinancialInput,
} from '@oficina/shared';
import { api } from '@/lib/api';

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function useFinancialSummary(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['financial-summary', params],
    queryFn: () => api.get<FinancialSummaryDto>(`/financial/summary${qs(params)}`),
  });
}

export function useFinancialEntries(params: Partial<ListFinancialEntriesQuery>) {
  return useQuery({
    queryKey: ['financial-entries', params],
    queryFn: () => api.get<Paginated<FinancialEntryDto>>(`/financial/entries${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCreateFinancialEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFinancialEntryInput) =>
      api.post<FinancialEntryDto>('/financial/entries', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['financial-entries'] });
      void qc.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}

export function usePayFinancialEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PayFinancialEntryInput) =>
      api.post<FinancialEntryDto>(`/financial/entries/${id}/pay`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['financial-entries'] });
      void qc.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}

export function useCancelFinancialEntry(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<FinancialEntryDto>(`/financial/entries/${id}/cancel`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['financial-entries'] });
      void qc.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}

export function useSyncServiceOrderFinancial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SyncServiceOrderFinancialInput) =>
      api.post<FinancialEntryDto>('/financial/sync/service-order', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['financial-entries'] });
      void qc.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}

export function useSyncPurchaseFinancial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SyncPurchaseFinancialInput) =>
      api.post<FinancialEntryDto>('/financial/sync/purchase-order', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['financial-entries'] });
      void qc.invalidateQueries({ queryKey: ['financial-summary'] });
    },
  });
}
