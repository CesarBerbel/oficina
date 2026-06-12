'use client';

import { useState } from 'react';
import { Phone, Mail } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  type LeadStatus,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { maskPhone } from '@/lib/masks';
import { useLeads, useUpdateLeadStatus } from '@/features/content/use-content';
import { formatDate } from '@/lib/utils';
import { Select } from '@/components/ui/select';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const VARIANT: Record<LeadStatus, BadgeProps['variant']> = {
  NOVO: 'default',
  EM_ATENDIMENTO: 'warning',
  CONVERTIDO: 'success',
  DESCARTADO: 'secondary',
};

export default function LeadsPage() {
  const [status, setStatus] = useState('');
  const { data, isLoading } = useLeads({ page: 1, pageSize: 50, status: (status || undefined) as LeadStatus | undefined });
  const updateStatus = useUpdateLeadStatus();
  const leads = data?.data ?? [];

  async function change(id: string, s: LeadStatus) {
    try { await updateStatus.mutateAsync({ id, status: s }); toast.success('Status atualizado'); }
    catch (err) { toast.error(err instanceof ApiError ? err.message : 'Erro'); }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leads do site</h1>
          <p className="text-muted-foreground">Contatos recebidos pelo formulário público.</p>
        </div>
        <Select className="sm:w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Todos os status</option>
          {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
        </Select>
      </div>

      {isLoading ? (
        <div className="grid h-40 place-items-center"><CarLoader className="size-6 animate-spin text-muted-foreground" /></div>
      ) : leads.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Nenhum lead.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {leads.map((l) => (
            <div key={l.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{l.name}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(l.createdAt)}</p>
                </div>
                <Badge variant={VARIANT[l.status]}>{LEAD_STATUS_LABELS[l.status]}</Badge>
              </div>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                <p className="flex items-center gap-2"><Phone className="size-3.5" /> {maskPhone(l.phone)}</p>
                {l.email && <p className="flex items-center gap-2"><Mail className="size-3.5" /> {l.email}</p>}
                {l.vehicle && <p>Veículo: {l.vehicle}</p>}
              </div>
              <p className="mt-2 text-sm">{l.message}</p>
              <div className="mt-3">
                <Select value={l.status} onChange={(e) => change(l.id, e.target.value as LeadStatus)} className="w-full">
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
                </Select>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
