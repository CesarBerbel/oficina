'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CrmSettingsDto, PostSaleDto, UpdateCrmSettingsInput } from '@oficina/shared';
import { api } from '@/lib/api';

export function usePostSaleCrm(limit = 80) {
  return useQuery({
    queryKey: ['crm', 'post-sale', limit],
    queryFn: () => api.get<PostSaleDto>(`/crm/post-sale?limit=${limit}`),
  });
}

export function useCrmSettings() {
  return useQuery({
    queryKey: ['crm', 'settings'],
    queryFn: () => api.get<CrmSettingsDto>('/crm/settings'),
  });
}

export function useUpdateCrmSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCrmSettingsInput) => api.put<CrmSettingsDto>('/crm/settings', input),
    onSuccess: (data) => {
      queryClient.setQueryData(['crm', 'settings'], data);
      queryClient.invalidateQueries({ queryKey: ['crm', 'post-sale'] });
    },
  });
}
