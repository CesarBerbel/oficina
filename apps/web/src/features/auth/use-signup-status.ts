'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Indica se o auto-cadastro de oficinas está habilitado (ALLOW_TENANT_SIGNUP). */
export function useSignupStatus() {
  return useQuery({
    queryKey: ['signup-status'],
    queryFn: () => api.get<{ enabled: boolean }>('/auth/signup-status'),
    staleTime: 5 * 60_000,
  });
}
