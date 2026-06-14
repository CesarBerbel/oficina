'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NotificationInboxDto,
  OperationalDashboardDto,
  OperationalDashboardSettingsDto,
  UpdateOperationalSettingsInput,
} from '@oficina/shared';
import { api } from '@/lib/api';

export function useOperationalDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'operational'],
    queryFn: () => api.get<OperationalDashboardDto>('/dashboard/operational'),
    refetchInterval: 60_000,
  });
}

export function useNotificationInbox() {
  return useQuery({
    queryKey: ['notifications', 'inbox'],
    queryFn: () => api.get<NotificationInboxDto>('/notifications/inbox'),
    refetchInterval: 30_000,
  });
}

export function useOperationalSettings() {
  return useQuery({
    queryKey: ['dashboard', 'operational', 'settings'],
    queryFn: () => api.get<OperationalDashboardSettingsDto>('/dashboard/operational/settings'),
  });
}

export function useUpdateOperationalSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOperationalSettingsInput) =>
      api.put<OperationalDashboardSettingsDto>('/dashboard/operational/settings', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dashboard', 'operational'] });
      qc.invalidateQueries({ queryKey: ['dashboard', 'operational', 'settings'] });
    },
  });
}
