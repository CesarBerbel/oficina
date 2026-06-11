'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PublicTrackingDto, QuoteDecisionInput } from '@oficina/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  return res.json() as Promise<T>;
}

export function usePublicTracking(token: string) {
  return useQuery({
    queryKey: ['public-tracking', token],
    queryFn: () => getJson<PublicTrackingDto>(`/public/track/${token}`),
    retry: false,
  });
}

export function useQuoteDecision(token: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: QuoteDecisionInput) => {
      const res = await fetch(`${API_URL}/public/track/${token}/quote-decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        let msg = 'Erro ao enviar decisão';
        try {
          const data = await res.json();
          msg = data.message ?? msg;
        } catch {
          /* sem corpo */
        }
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['public-tracking', token] }),
  });
}
