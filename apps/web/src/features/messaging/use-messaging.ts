'use client';

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  CreateTemplateInput,
  MailStatusDto,
  MessageLogDto,
  MessageTemplateDto,
  Paginated,
  SendMessageInput,
  SendTestEmailResult,
  UpdateTemplateInput,
} from '@oficina/shared';
import { api } from '@/lib/api';

export function useTemplates() {
  return useQuery({
    queryKey: ['msg-templates'],
    queryFn: () => api.get<MessageTemplateDto[]>('/messages/templates'),
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTemplateInput) =>
      api.post<MessageTemplateDto>('/messages/templates', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['msg-templates'] }),
  });
}

export function useUpdateTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTemplateInput) =>
      api.put<MessageTemplateDto>(`/messages/templates/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['msg-templates'] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/messages/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['msg-templates'] }),
  });
}

export function useMessageLogs(page: number) {
  return useQuery({
    queryKey: ['msg-logs', page],
    queryFn: () => api.get<Paginated<MessageLogDto>>(`/messages/logs?page=${page}&pageSize=20`),
    placeholderData: keepPreviousData,
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => api.post<MessageLogDto>('/messages/send', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['msg-logs'] }),
  });
}

export function useMailStatus() {
  return useQuery({
    queryKey: ['mail-status'],
    queryFn: () => api.get<MailStatusDto>('/messages/mail-status'),
    staleTime: 5 * 60_000,
  });
}

export function useSendTestEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (to: string) => api.post<SendTestEmailResult>('/messages/test-email', { to }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['msg-logs'] }),
  });
}
