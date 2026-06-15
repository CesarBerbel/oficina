'use client';

import { useState } from 'react';
import { DollarSign, Plus, Search, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  FinancialEntryStatus,
  FinancialEntryType,
  FINANCIAL_ENTRY_STATUS_LABELS,
  FINANCIAL_ENTRY_TYPE_LABELS,
  type FinancialEntryDto,
} from '@oficina/shared';
import { CarLoader } from '@/components/car-loader';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { FinancialFormDialog } from '@/features/financial/financial-form-dialog';
import { PayFinancialDialog } from '@/features/financial/pay-financial-dialog';
import { useCancelFinancialEntry, useFinancialEntries, useFinancialSummary } from '@/features/financial/use-financial';

const STATUS_VARIANT: Record<FinancialEntryStatus, BadgeProps['variant']> = {
  OPEN: 'secondary',
  PARTIAL: 'warning',
  PAID: 'success',
  CANCELED: 'destructive',
};

export default function FinancialPage() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission('finance:write');
  const [formOpen, setFormOpen] = useState(false);
  const [payEntry, setPayEntry] = useState<FinancialEntryDto | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [type, setType] = useState<'' | FinancialEntryType>('');
  const [status, setStatus] = useState<'' | FinancialEntryStatus>('');
  const { data: summary, isLoading: loadingSummary } = useFinancialSummary();
  const { data, isLoading } = useFinancialEntries({ page, pageSize: 20, search, type: type || undefined, status: status || undefined });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-muted-foreground">Contas a receber, contas a pagar, baixas e fluxo de caixa.</p>
        </div>
        {canWrite && <Button onClick={() => setFormOpen(true)}><Plus className="size-4" /> Novo lançamento</Button>}
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Kpi title="A receber em aberto" value={summary?.receivableOpen ?? 0} loading={loadingSummary} tone="positive" />
        <Kpi title="A pagar em aberto" value={summary?.payableOpen ?? 0} loading={loadingSummary} tone="negative" />
        <Kpi title="Fluxo realizado 30 dias" value={summary?.netCashFlow ?? 0} loading={loadingSummary} tone={(summary?.netCashFlow ?? 0) >= 0 ? 'positive' : 'negative'} />
        <Kpi title="Saldo projetado" value={summary?.projectedBalance ?? 0} loading={loadingSummary} tone={(summary?.projectedBalance ?? 0) >= 0 ? 'positive' : 'negative'} />
      </div>

      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <div className="relative min-w-60 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por descrição, categoria, cliente ou fornecedor" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select value={type} onChange={(e) => { setType(e.target.value as typeof type); setPage(1); }} className="w-48">
            <option value="">Todos os tipos</option>
            {Object.values(FinancialEntryType).map((option) => <option key={option} value={option}>{FINANCIAL_ENTRY_TYPE_LABELS[option]}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} className="w-44">
            <option value="">Todos os status</option>
            {Object.values(FinancialEntryStatus).map((option) => <option key={option} value={option}>{FINANCIAL_ENTRY_STATUS_LABELS[option]}</option>)}
          </Select>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lançamento</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">Saldo</TableHead>
              <TableHead className="w-40 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center"><CarLoader className="mx-auto size-5 animate-spin text-muted-foreground" /></TableCell></TableRow>
            ) : (data?.data ?? []).length === 0 ? (
              <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">Nenhum lançamento financeiro.</TableCell></TableRow>
            ) : (
              data!.data.map((entry) => <EntryRow key={entry.id} entry={entry} canWrite={canWrite} onPay={() => setPayEntry(entry)} />)
            )}
          </TableBody>
        </Table>

        {data?.meta && data.meta.totalPages > 1 && (
          <div className="mt-4 flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span className="text-sm text-muted-foreground">Página {data.meta.page} de {data.meta.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
          </div>
        )}
      </div>

      <FinancialFormDialog open={formOpen} onOpenChange={setFormOpen} />
      <PayFinancialDialog entry={payEntry} open={!!payEntry} onOpenChange={(open) => !open && setPayEntry(null)} />
    </div>
  );
}

function Kpi({ title, value, loading, tone }: { title: string; value: number; loading: boolean; tone: 'positive' | 'negative' }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{title}</p>
        <DollarSign className="size-4 text-muted-foreground" />
      </div>
      {loading ? <CarLoader className="size-5 animate-spin text-muted-foreground" /> : (
        <p className={cn('text-2xl font-bold tabular-nums', tone === 'positive' ? 'text-emerald-600' : 'text-rose-600')}>{formatCurrency(value)}</p>
      )}
    </div>
  );
}

function EntryRow({ entry, canWrite, onPay }: { entry: FinancialEntryDto; canWrite: boolean; onPay: () => void }) {
  const cancel = useCancelFinancialEntry(entry.id);
  const canSettle = canWrite && entry.status !== FinancialEntryStatus.PAID && entry.status !== FinancialEntryStatus.CANCELED;
  async function onCancel() {
    try {
      await cancel.mutateAsync();
      toast.success('Lançamento cancelado');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao cancelar');
    }
  }
  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{entry.description}</p>
        <p className="text-xs text-muted-foreground">
          {entry.customerName ?? entry.supplierName ?? entry.category ?? 'Sem vínculo'}
          {entry.serviceOrderNumber != null && ` · OS #${entry.serviceOrderNumber}`}
          {entry.purchaseOrderNumber != null && ` · Compra #${entry.purchaseOrderNumber}`}
        </p>
      </TableCell>
      <TableCell>{FINANCIAL_ENTRY_TYPE_LABELS[entry.type]}</TableCell>
      <TableCell className={entry.overdue ? 'font-medium text-destructive' : ''}>{formatDate(entry.dueDate)}{entry.overdue && <span className="block text-xs">vencido</span>}</TableCell>
      <TableCell><Badge variant={STATUS_VARIANT[entry.status]}>{FINANCIAL_ENTRY_STATUS_LABELS[entry.status]}</Badge></TableCell>
      <TableCell className="text-right font-medium">{formatCurrency(entry.amount)}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(entry.remainingAmount)}</TableCell>
      <TableCell className="text-right">
        {canSettle && (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={onPay}><CheckCircle2 className="size-4" /> Baixa</Button>
            {entry.paidAmount === 0 && <Button size="icon" variant="ghost" disabled={cancel.isPending} onClick={onCancel} title="Cancelar"><XCircle className="size-4" /></Button>}
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
