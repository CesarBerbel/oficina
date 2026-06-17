'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AddItemInput,
  ChangeStatusInput,
  CreateServiceOrderTechnicalUpdateInput,
  CreateServiceOrderInput,
  DiagnoseServiceOrderInput,
  ListServiceOrdersQuery,
  Paginated,
  ServiceOrderBoardItemDto,
  ServiceOrderDetailDto,
  ServiceOrderEventDto,
  ServiceOrderStatus,
  ServiceOrderSummaryDto,
  ServiceOrderTransitionDto,
  UpdateItemInput,
  UpdateServiceOrderInput,
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

const BASE = '/service-orders';

export function useServiceOrders(params: Partial<ListServiceOrdersQuery>) {
  return useQuery({
    queryKey: ['service-orders', params],
    queryFn: () => api.get<Paginated<ServiceOrderSummaryDto>>(`${BASE}${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useServiceOrderBoard() {
  return useQuery({
    queryKey: ['service-orders', 'board'],
    queryFn: () => api.get<Record<ServiceOrderStatus, ServiceOrderBoardItemDto[]>>(`${BASE}/board`),
    refetchInterval: 30_000,
  });
}

export function useTechnicians() {
  return useQuery({
    queryKey: ['service-orders', 'technicians'],
    queryFn: () => api.get<{ id: string; name: string }[]>(`${BASE}/technicians`),
    staleTime: 5 * 60_000,
  });
}

export function useServiceOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['service-orders', 'detail', id],
    queryFn: () => api.get<ServiceOrderDetailDto>(`${BASE}/${id}`),
    enabled: !!id,
  });
}

export function useServiceOrderTransitions(id: string | undefined) {
  return useQuery({
    queryKey: ['service-orders', 'transitions', id],
    queryFn: () => api.get<ServiceOrderTransitionDto[]>(`${BASE}/${id}/transitions`),
    enabled: !!id,
  });
}

export function useServiceOrderTimeline(id: string | undefined) {
  return useQuery({
    queryKey: ['service-orders', 'timeline', id],
    queryFn: () => api.get<ServiceOrderEventDto[]>(`${BASE}/${id}/timeline`),
    enabled: !!id,
  });
}

export function useCreateTechnicalUpdate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceOrderTechnicalUpdateInput) =>
      api.post<ServiceOrderEventDto[]>(`${BASE}/${id}/technical-update`, input),
    onSuccess: () => {
      invalidate(qc, id);
      qc.invalidateQueries({ queryKey: ['service-orders', 'timeline', id] });
    },
  });
}

export function useCreateServiceOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceOrderInput) => api.post<ServiceOrderDetailDto>(BASE, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-orders'] }),
  });
}

function invalidate(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: ['service-orders'] });
  qc.invalidateQueries({ queryKey: ['service-orders', 'detail', id] });
  qc.invalidateQueries({ queryKey: ['service-orders', 'transitions', id] });
}

export function useUpdateServiceOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateServiceOrderInput) =>
      api.patch<ServiceOrderDetailDto>(`${BASE}/${id}`, input),
    onSuccess: () => invalidate(qc, id),
  });
}

export function useDiagnoseServiceOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: DiagnoseServiceOrderInput) =>
      api.patch<ServiceOrderDetailDto>(`${BASE}/${id}/diagnosis`, input),
    onSuccess: () => invalidate(qc, id),
  });
}

export function useChangeStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangeStatusInput) =>
      api.post<ServiceOrderDetailDto>(`${BASE}/${id}/status`, input),
    onSuccess: () => invalidate(qc, id),
  });
}

export function useAddItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddItemInput) =>
      api.post<ServiceOrderDetailDto>(`${BASE}/${id}/items`, input),
    onSuccess: () => invalidate(qc, id),
  });
}

export function useUpdateItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: UpdateItemInput }) =>
      api.patch<ServiceOrderDetailDto>(`${BASE}/${id}/items/${itemId}`, input),
    onSuccess: () => invalidate(qc, id),
  });
}

export function useRemoveItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      api.delete<ServiceOrderDetailDto>(`${BASE}/${id}/items/${itemId}`),
    onSuccess: () => invalidate(qc, id),
  });
}

export function useGenerateQuote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { publicNotes?: string; reason?: string }) =>
      api.post<unknown>(`${BASE}/${id}/quote`, input),
    onSuccess: () => invalidate(qc, id),
  });
}

export function useSendQuoteEmail(id: string) {
  return useMutation({
    mutationFn: () => api.post<{ to: string }>(`${BASE}/${id}/quote/send-email`, {}),
  });
}

export function useReopenQuote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<unknown>(`${BASE}/${id}/quote/reopen`, {}),
    onSuccess: () => invalidate(qc, id),
  });
}

export function useGeneratePurchase(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ created: number }>(`${BASE}/${id}/quote/generate-purchase`, {}),
    onSuccess: () => {
      invalidate(qc, id);
      qc.invalidateQueries({ queryKey: ['purchases'] });
    },
  });
}

export function useAddFromCatalog(id: string) {
  const qc = useQueryClient();
  const onSuccess = () => {
    invalidate(qc, id);
    qc.invalidateQueries({ queryKey: ['parts'] });
  };
  return {
    addService: useMutation({
      mutationFn: (serviceId: string) =>
        api.post<ServiceOrderDetailDto>(`${BASE}/${id}/add-service`, { serviceId }),
      onSuccess,
    }),
    addPart: useMutation({
      mutationFn: (vars: { partId: string; quantity: number }) =>
        api.post<ServiceOrderDetailDto>(`${BASE}/${id}/add-part`, vars),
      onSuccess,
    }),
    addCombo: useMutation({
      mutationFn: (comboId: string) =>
        api.post<ServiceOrderDetailDto>(`${BASE}/${id}/add-combo`, { comboId }),
      onSuccess,
    }),
  };
}
