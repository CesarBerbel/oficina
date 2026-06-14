'use client';

import { useQuery } from '@tanstack/react-query';
import type { PostSaleDto } from '@oficina/shared';
import { api } from '@/lib/api';

export function usePostSaleCrm(limit = 80) {
  return useQuery({
    queryKey: ['crm', 'post-sale', limit],
    queryFn: () => api.get<PostSaleDto>(`/crm/post-sale?limit=${limit}`),
  });
}
