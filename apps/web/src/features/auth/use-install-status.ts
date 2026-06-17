'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** Indica se o sistema já foi instalado (existe ao menos uma oficina). */
export function useInstallStatus() {
  return useQuery({
    queryKey: ['install-status'],
    queryFn: () => api.get<{ installed: boolean }>('/auth/install-status'),
    staleTime: 5 * 60_000,
  });
}
