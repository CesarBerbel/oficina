'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountDto,
  AccountRequestDto,
  PlatformOverviewDto,
  ProvisionedAccountDto,
} from '@oficina/shared';
import { api } from '@/lib/api';

const ACCOUNTS_KEY = ['platform-accounts'];
const REQUESTS_KEY = ['platform-account-requests'];

export function usePlatformOverview() {
  return useQuery({
    queryKey: ['platform-overview'],
    queryFn: () => api.get<PlatformOverviewDto>('/platform/accounts/overview'),
  });
}

export function usePlatformAccounts() {
  return useQuery({
    queryKey: ACCOUNTS_KEY,
    queryFn: () => api.get<AccountDto[]>('/platform/accounts'),
  });
}

export function useAccountRequests() {
  return useQuery({
    queryKey: REQUESTS_KEY,
    queryFn: () => api.get<AccountRequestDto[]>('/platform/accounts/requests?status=PENDING'),
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<ProvisionedAccountDto>(`/platform/accounts/requests/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: REQUESTS_KEY });
      qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
    },
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post(`/platform/accounts/requests/${id}/reject`),
    onSuccess: () => qc.invalidateQueries({ queryKey: REQUESTS_KEY }),
  });
}

export function useSetAccountStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'ACTIVE' | 'SUSPENDED' }) =>
      api.patch<AccountDto>(`/platform/accounts/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ACCOUNTS_KEY }),
  });
}
