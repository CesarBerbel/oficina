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

export function useAccountingAccounts() {
  return useQuery({
    queryKey: ['accounting-accounts'],
    queryFn: () =>
      api.get<import('@oficina/shared').AccountingAccountDto[]>('/financial/accounting/accounts'),
  });
}

export function useAccountingJournals(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['accounting-journals', params],
    queryFn: () =>
      api.get<import('@oficina/shared').AccountingJournalDto[]>(
        `/financial/accounting/journals${qs(params)}`,
      ),
  });
}

export function useTrialBalance(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['trial-balance', params],
    queryFn: () =>
      api.get<import('@oficina/shared').AccountingTrialBalanceDto>(
        `/financial/accounting/trial-balance${qs(params)}`,
      ),
  });
}

export function useIncomeStatement(params: { from?: string; to?: string } = {}) {
  return useQuery({
    queryKey: ['income-statement', params],
    queryFn: () =>
      api.get<import('@oficina/shared').AccountingIncomeStatementDto>(
        `/financial/accounting/income-statement${qs(params)}`,
      ),
  });
}

export function useReverseFinancialPayment(entryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ paymentId, reason }: { paymentId: string; reason: string }) =>
      api.post<FinancialEntryDto>(`/financial/entries/${entryId}/payments/${paymentId}/reverse`, {
        reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['financial-entries'] });
      void qc.invalidateQueries({ queryKey: ['financial-summary'] });
      void qc.invalidateQueries({ queryKey: ['accounting-journals'] });
      void qc.invalidateQueries({ queryKey: ['trial-balance'] });
      void qc.invalidateQueries({ queryKey: ['income-statement'] });
    },
  });
}
