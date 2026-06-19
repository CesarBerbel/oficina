'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreatePartInput,
  ListPartsQuery,
  Paginated,
  PartDto,
  StockMovementDto,
  StockMovementInput,
  UpdatePartInput,
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

export function useParts(params: Partial<ListPartsQuery>) {
  return useQuery({
    queryKey: ['parts', params],
    queryFn: () => api.get<Paginated<PartDto>>(`/parts${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function usePartMovements(partId: string | undefined) {
  return useQuery({
    queryKey: ['parts', 'movements', partId],
    queryFn: () => api.get<StockMovementDto[]>(`/parts/${partId}/movements`),
    enabled: !!partId,
  });
}

export function useCreatePart() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePartInput) => api.post<PartDto>('/parts', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

export function useUpdatePart(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdatePartInput) => api.put<PartDto>(`/parts/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

export function useStockMove(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StockMovementInput) => api.post<PartDto>(`/parts/${id}/movements`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}

export function useStockReservations(params: { status?: string; partId?: string } = {}) {
  return useQuery({
    queryKey: ['stock-reservations', params],
    queryFn: () =>
      api.get<import('@oficina/shared').StockReservationDto[]>(`/parts/reservations${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useStockReservationSummary() {
  return useQuery({
    queryKey: ['stock-reservations-summary'],
    queryFn: () =>
      api.get<import('@oficina/shared').StockReservationSummaryDto>('/parts/reservations/summary'),
  });
}

export function useReorderSuggestions() {
  return useQuery({
    queryKey: ['reorder-suggestions'],
    queryFn: () =>
      api.get<import('@oficina/shared').ReorderSuggestionDto[]>('/parts/reorder-suggestions'),
  });
}

export function useReleaseStockReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<import('@oficina/shared').StockReservationDto>(`/parts/reservations/${id}/release`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['parts'] });
      void qc.invalidateQueries({ queryKey: ['stock-reservations'] });
      void qc.invalidateQueries({ queryKey: ['stock-reservations-summary'] });
      void qc.invalidateQueries({ queryKey: ['reorder-suggestions'] });
    },
  });
}
