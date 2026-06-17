'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateBranchInput, PlatformTenantDto } from '@oficina/shared';
import { api } from '@/lib/api';

export function usePlatformTenants() {
  return useQuery({
    queryKey: ['platform-tenants'],
    queryFn: () => api.get<PlatformTenantDto[]>('/platform/tenants'),
  });
}

export function useCreateBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBranchInput) =>
      api.post<PlatformTenantDto>('/platform/tenants', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-tenants'] }),
  });
}

export function useSetTenantActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch<PlatformTenantDto>(`/platform/tenants/${id}`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-tenants'] }),
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/platform/tenants/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-tenants'] }),
  });
}
