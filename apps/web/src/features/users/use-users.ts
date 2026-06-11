'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreateUserInput,
  ListUsersQuery,
  Paginated,
  UpdateUserInput,
  UserDto,
} from '@oficina/shared';
import { api } from '@/lib/api';

function buildQuery(params: Partial<ListUsersQuery>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  });
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function useUsers(params: Partial<ListUsersQuery>) {
  return useQuery({
    queryKey: ['users', params],
    queryFn: () => api.get<Paginated<UserDto>>(`/users${buildQuery(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => api.post<UserDto>('/users', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUser(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateUserInput) =>
      api.put<UserDto>(`/users/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch<UserDto>(`/users/${id}/active`, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
