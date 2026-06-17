'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CheckinDto, CreateCheckinInput, ListCheckinsQuery, Paginated } from '@oficina/shared';
import { api } from '@/lib/api';

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export function useCheckins(params: Partial<ListCheckinsQuery>) {
  return useQuery({
    queryKey: ['checkins', params],
    queryFn: () => api.get<Paginated<CheckinDto>>(`/checkins${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCheckin(id: string | undefined) {
  return useQuery({
    queryKey: ['checkins', 'one', id],
    queryFn: () => api.get<CheckinDto>(`/checkins/${id}`),
    enabled: !!id,
  });
}

export function useCreateCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCheckinInput) => api.post<CheckinDto>('/checkins', input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkins'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
}
