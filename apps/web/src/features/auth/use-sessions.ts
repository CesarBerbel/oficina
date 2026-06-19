'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UserSessionDto } from '@oficina/shared';
import { api } from '@/lib/api';

export function useUserSessions() {
  return useQuery({
    queryKey: ['auth-sessions'],
    queryFn: () => api.get<UserSessionDto[]>('/auth/sessions'),
    refetchInterval: 60_000,
  });
}

export function useRevokeUserSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['auth-sessions'] }),
  });
}
