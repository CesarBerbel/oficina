'use client';

import { useQuery } from '@tanstack/react-query';
import type { GlobalSearchResponseDto } from '@oficina/shared';
import { api } from '@/lib/api';

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      sp.set(key, String(value));
    }
  });
  const query = sp.toString();
  return query ? `?${query}` : '';
}

export function useGlobalSearch(query: string, open: boolean) {
  const normalized = query.trim();

  return useQuery({
    queryKey: ['global-search', normalized],
    queryFn: () =>
      api.get<GlobalSearchResponseDto>(`/global-search${qs({ q: normalized, limit: 8 })}`),
    enabled: open && normalized.length >= 2,
    staleTime: 15_000,
  });
}
