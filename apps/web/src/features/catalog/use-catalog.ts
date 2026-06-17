'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ComboDto,
  CreateComboInput,
  CreateServiceInput,
  ListServicesQuery,
  Paginated,
  ServiceDto,
  UpdateComboInput,
  UpdateServiceInput,
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

// ─── Serviços ───
export function useServices(params: Partial<ListServicesQuery>) {
  return useQuery({
    queryKey: ['services', params],
    queryFn: () => api.get<Paginated<ServiceDto>>(`/services${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceInput) => api.post<ServiceDto>('/services', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useUpdateService(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateServiceInput) => api.put<ServiceDto>(`/services/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/services/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
}

// ─── Combos ───
export function useCombos(params: { page?: number; pageSize?: number; search?: string }) {
  return useQuery({
    queryKey: ['combos', params],
    queryFn: () => api.get<Paginated<ComboDto>>(`/combos${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCreateCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateComboInput) => api.post<ComboDto>('/combos', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['combos'] }),
  });
}

export function useUpdateCombo(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateComboInput) => api.put<ComboDto>(`/combos/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['combos'] }),
  });
}

export function useDeleteCombo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/combos/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['combos'] }),
  });
}
