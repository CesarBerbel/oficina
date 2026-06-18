'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTenantDomainInput, TenantDomainDto } from '@oficina/shared';
import { api } from '@/lib/api';

const KEY = ['tenant-domains'];

export function useDomains() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<TenantDomainDto[]>('/tenant-domains'),
  });
}

export function useAddDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTenantDomainInput) =>
      api.post<TenantDomainDto>('/tenant-domains', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useRemoveDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/tenant-domains/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useVerifyDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<TenantDomainDto>(`/tenant-domains/${id}/verify`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
