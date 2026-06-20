'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AccountDto,
  AccountRequestDto,
  PlatformOverviewDto,
  PlatformSessionDto,
  ProvisionedAccountDto,
  ResetAdminPasswordDto,
  PlanDto,
  UpsertPlanInput,
  AssignAccountPlanInput,
  AccountQuotaSummaryDto,
} from '@oficina/shared';
import { api } from '@/lib/api';

const ACCOUNTS_KEY = ['platform-accounts'];
const REQUESTS_KEY = ['platform-account-requests'];
const PLANS_KEY = ['platform-plans'];

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

export function useResetAccountAdminPassword() {
  return useMutation({
    mutationFn: (accountId: string) =>
      api.post<ResetAdminPasswordDto>(`/platform/accounts/${accountId}/reset-admin-password`),
  });
}

export function usePlatformSessions() {
  return useQuery({
    queryKey: ['platform-sessions'],
    queryFn: () => api.get<PlatformSessionDto[]>('/platform/sessions'),
    refetchInterval: 60_000,
  });
}

export function useRevokePlatformSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/platform/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-sessions'] }),
  });
}

export function useLogoutPlatformUserSessions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.post(`/platform/sessions/users/${userId}/logout-all`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['platform-sessions'] }),
  });
}

export function usePlatformPlans() {
  return useQuery({
    queryKey: PLANS_KEY,
    queryFn: () => api.get<PlanDto[]>('/platform/plans'),
  });
}

export function useUpsertPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPlanInput) => api.post<PlanDto>('/platform/plans', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: PLANS_KEY }),
  });
}

export function useAssignAccountPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, input }: { accountId: string; input: AssignAccountPlanInput }) =>
      api.post(`/platform/plans/accounts/${accountId}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACCOUNTS_KEY });
      qc.invalidateQueries({ queryKey: ['platform-overview'] });
    },
  });
}

export function useAccountUsage(accountId: string | null) {
  return useQuery({
    queryKey: ['platform-account-usage', accountId],
    enabled: !!accountId,
    queryFn: () => api.get<AccountQuotaSummaryDto>(`/platform/plans/accounts/${accountId}/usage`),
  });
}
