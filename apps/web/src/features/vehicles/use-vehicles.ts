'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateVehicleInput,
  ListVehiclesQuery,
  Paginated,
  UpdateVehicleInput,
  VehicleDto,
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

export function useVehicles(params: Partial<ListVehiclesQuery>) {
  return useQuery({
    queryKey: ['vehicles', params],
    queryFn: () => api.get<Paginated<VehicleDto>>(`/vehicles${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCreateVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVehicleInput) =>
      api.post<VehicleDto>('/vehicles', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}

export function useUpdateVehicle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateVehicleInput) =>
      api.put<VehicleDto>(`/vehicles/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/vehicles/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
  });
}
