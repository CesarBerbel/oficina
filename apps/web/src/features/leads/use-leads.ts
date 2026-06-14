'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AppointmentActionInput,
  ConvertLeadToServiceOrderInput,
  CreateReceptionScheduleBlockInput,
  CreateDirectReceptionLeadInput,
  LeadDetailDto,
  LeadDto,
  LeadStatus,
  LinkLeadCustomerInput,
  LinkLeadVehicleInput,
  ListLeadsQuery,
  Paginated,
  ReceptionAlertsDto,
  ReceptionScheduleBlockDto,
  RegisterLeadContactInput,
  ScheduleLeadInput,
} from '@oficina/shared';
import { api } from '@/lib/api';

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

function refreshLeadQueries(qc: ReturnType<typeof useQueryClient>, data: LeadDetailDto) {
  qc.invalidateQueries({ queryKey: ['leads'] });
  qc.invalidateQueries({ queryKey: ['reception-alerts'] });
  qc.setQueryData(['lead', data.id], data);
}

export function useLeads(params: Partial<ListLeadsQuery>) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => api.get<Paginated<LeadDto>>(`/leads${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}



export function useReceptionScheduleBlocks(params: { from: string; to: string; technicianId?: string }) {
  return useQuery({
    queryKey: ['leads', 'schedule-blocks', params],
    queryFn: () => api.get<ReceptionScheduleBlockDto[]>(`/leads/schedule-blocks${qs(params)}`),
    enabled: Boolean(params.from && params.to),
    placeholderData: keepPreviousData,
  });
}

export function useCreateReceptionScheduleBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReceptionScheduleBlockInput) =>
      api.post<ReceptionScheduleBlockDto>('/leads/schedule-blocks', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', 'schedule-blocks'] }),
  });
}

export function useDeleteReceptionScheduleBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/leads/schedule-blocks/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads', 'schedule-blocks'] }),
  });
}

export function useReceptionAlerts() {
  return useQuery({
    queryKey: ['reception-alerts'],
    queryFn: () => api.get<ReceptionAlertsDto>('/leads/reception-alerts'),
    refetchInterval: 60_000,
  });
}

export function useLead(id?: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.get<LeadDetailDto>(`/leads/${id}`),
    enabled: Boolean(id),
  });
}

export function useCreateDirectReceptionLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDirectReceptionLeadInput) =>
      api.post<LeadDetailDto>('/leads/direct-reception', input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      api.post<LeadDetailDto>(`/leads/${id}/status`, { status }),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useRegisterLeadContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RegisterLeadContactInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/contact-attempts`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useScheduleLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ScheduleLeadInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/schedule`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useConfirmLeadAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AppointmentActionInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/confirm-appointment`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useCheckInLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AppointmentActionInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/check-in`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useNoShowLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AppointmentActionInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/no-show`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useCancelLeadCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AppointmentActionInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/cancel-check-in`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useCancelLeadAppointment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AppointmentActionInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/cancel-appointment`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useLinkLeadCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LinkLeadCustomerInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/link-customer`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useLinkLeadVehicle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: LinkLeadVehicleInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/link-vehicle`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}

export function useConvertLeadToServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ConvertLeadToServiceOrderInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/convert-to-os`, input),
    onSuccess: (data) => refreshLeadQueries(qc, data),
  });
}
