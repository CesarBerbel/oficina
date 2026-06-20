'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateAccountBranchInput,
  CreatedBranchDto,
  PlatformTenantDto,
  RenameTenantInput,
} from '@oficina/shared';
import { api } from '@/lib/api';

const KEY = ['account-tenants'];

/** Oficinas (matriz + filiais) da conta do usuário logado. */
export function useAccountTenants() {
  return useQuery({
    queryKey: KEY,
    queryFn: () => api.get<PlatformTenantDto[]>('/account/tenants'),
  });
}

export function useCreateAccountBranch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountBranchInput) =>
      api.post<CreatedBranchDto>('/account/tenants', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ['billing-usage'] });
    },
  });
}

export function useRenameTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RenameTenantInput }) =>
      api.patch<PlatformTenantDto>(`/account/tenants/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
