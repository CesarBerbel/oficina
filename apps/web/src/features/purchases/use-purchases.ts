'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type {
  CreatePurchaseInput,
  CreateSupplierInput,
  ListPurchasesQuery,
  NfeConfirmInput,
  NfeConfirmResult,
  NfeParseResult,
  Paginated,
  PurchaseOrderDto,
  PurchaseOrderSummaryDto,
  ReceivePurchaseInput,
  SupplierDto,
  UpdateSupplierInput,
} from '@oficina/shared';
import { api, getAccessToken, API_URL } from '@/lib/api';

function qs(params: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '' && v !== null) sp.set(k, String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ─── Fornecedores ───
export function useSuppliers(params: { page?: number; pageSize?: number; search?: string }) {
  return useQuery({
    queryKey: ['suppliers', params],
    queryFn: () => api.get<Paginated<SupplierDto>>(`/suppliers${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSupplierInput) => api.post<SupplierDto>('/suppliers', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useUpdateSupplier(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSupplierInput) => api.put<SupplierDto>(`/suppliers/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

// ─── Pedidos de compra ───
export function usePurchases(params: Partial<ListPurchasesQuery>) {
  return useQuery({
    queryKey: ['purchases', params],
    queryFn: () => api.get<Paginated<PurchaseOrderSummaryDto>>(`/purchase-orders${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function usePurchase(id: string | undefined) {
  return useQuery({
    queryKey: ['purchases', 'detail', id],
    queryFn: () => api.get<PurchaseOrderDto>(`/purchase-orders/${id}`),
    enabled: !!id,
  });
}

function invalidatePurchases(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['purchases'] });
  qc.invalidateQueries({ queryKey: ['parts'] });
}

export function useCreatePurchase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePurchaseInput) => api.post<PurchaseOrderDto>('/purchase-orders', input),
    onSuccess: () => invalidatePurchases(qc),
  });
}

export function useCreateFromShortages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ created: number }>('/purchase-orders/from-shortages'),
    onSuccess: () => invalidatePurchases(qc),
  });
}

export function useReceivePurchase(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReceivePurchaseInput) => api.post<PurchaseOrderDto>(`/purchase-orders/${id}/receive`, input),
    onSuccess: () => invalidatePurchases(qc),
  });
}

export function useSetPurchaseStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: 'ENVIADO' | 'CANCELADO') =>
      api.post<PurchaseOrderDto>(`/purchase-orders/${id}/status`, { status }),
    onSuccess: () => invalidatePurchases(qc),
  });
}

// ─── NF-e ───
export async function parseNfe(file: File): Promise<NfeParseResult> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/nfe-import/parse`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    let msg = 'Falha ao ler o arquivo';
    try {
      const d = await res.json();
      msg = d.message ?? msg;
    } catch {
      /* */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<NfeParseResult>;
}

export function useConfirmNfe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NfeConfirmInput) => api.post<NfeConfirmResult>('/nfe-import/confirm', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parts'] }),
  });
}
