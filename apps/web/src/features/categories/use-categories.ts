'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CategoryDto,
  CategoryKind,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '@oficina/shared';
import { api } from '@/lib/api';

export function useCategories(kind?: CategoryKind) {
  return useQuery({
    queryKey: ['categories', kind ?? 'all'],
    queryFn: () =>
      api.get<CategoryDto[]>(`/categories${kind ? `?kind=${kind}` : ''}`),
    staleTime: 5 * 60_000,
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['categories'] });
}

export function useCreateCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCategoryInput) =>
      api.post<CategoryDto>('/categories', input),
    onSuccess: () => invalidate(qc),
  });
}

export function useUpdateCategory(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCategoryInput) =>
      api.put<CategoryDto>(`/categories/${id}`, input),
    onSuccess: () => invalidate(qc),
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/categories/${id}`),
    onSuccess: () => invalidate(qc),
  });
}
