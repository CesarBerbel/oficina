'use client';

import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import type {
  BlogPostDto,
  BlogStatus,
  CreateBlogPostInput,
  ConvertLeadToServiceOrderInput,
  LeadDetailDto,
  LeadDto,
  LeadStatus,
  LinkLeadCustomerInput,
  LinkLeadVehicleInput,
  RegisterLeadContactInput,
  ListBlogPostsQuery,
  ListLeadsQuery,
  Paginated,
  SiteSettingsDto,
  UpdateBlogPostInput,
  UpdateSiteSettingsInput,
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

// ─── Site ───
export function useSiteSettings() {
  return useQuery({
    queryKey: ['site-settings'],
    queryFn: () => api.get<SiteSettingsDto>('/site-settings'),
  });
}

export function useUpdateSiteSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSiteSettingsInput) => api.put<SiteSettingsDto>('/site-settings', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['site-settings'] }),
  });
}

// ─── Blog ───
export function useBlogPosts(params: Partial<ListBlogPostsQuery>) {
  return useQuery({
    queryKey: ['blog', params],
    queryFn: () => api.get<Paginated<BlogPostDto>>(`/blog${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useCreateBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBlogPostInput) => api.post<BlogPostDto>('/blog', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog'] }),
  });
}

export function useUpdateBlogPost(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBlogPostInput) => api.put<BlogPostDto>(`/blog/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog'] }),
  });
}

export function useDeleteBlogPost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/blog/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog'] }),
  });
}

/** Publica ou volta um artigo para rascunho. */
export function useSetBlogPostStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: BlogStatus }) =>
      api.put<BlogPostDto>(`/blog/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blog'] }),
  });
}

// ─── Leads ───
export function useLeads(params: Partial<ListLeadsQuery>) {
  return useQuery({
    queryKey: ['leads', params],
    queryFn: () => api.get<Paginated<LeadDto>>(`/leads${qs(params)}`),
    placeholderData: keepPreviousData,
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      api.post<LeadDetailDto>(`/leads/${id}/status`, { status }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['leads'] });
      qc.setQueryData(['lead', data.id], data);
    },
  });
}

export function useLead(id?: string) {
  return useQuery({
    queryKey: ['lead', id],
    queryFn: () => api.get<LeadDetailDto>(`/leads/${id}`),
    enabled: Boolean(id),
  });
}

function refreshLeadQueries(qc: ReturnType<typeof useQueryClient>, data: LeadDetailDto) {
  qc.invalidateQueries({ queryKey: ['leads'] });
  qc.setQueryData(['lead', data.id], data);
}

export function useRegisterLeadContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RegisterLeadContactInput }) =>
      api.post<LeadDetailDto>(`/leads/${id}/contact-attempts`, input),
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
